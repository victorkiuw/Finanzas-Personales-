import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Chip, HelperText, SegmentedButtons, Switch, Text, TextInput, useTheme } from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import { listarCategorias, type Categoria } from '../db/categorias';
import {
  actualizarRecurrente,
  claveHoy,
  crearRecurrente,
  eliminarRecurrente,
  NOMBRE_FRECUENCIA,
  obtenerRecurrente,
  type Frecuencia,
} from '../db/recurrentes';
import { actualizarAvisosRecurrentes } from '../lib/avisos';
import { fechaSimpleLegible } from '../lib/fechas';
import { centimosATexto, INFO_MONEDA, parsearMonto } from '../lib/moneda';
import { pedirPermiso } from '../lib/notificaciones';
import { SelectorBilletera } from './SelectorBilletera';

export function FormularioRecurrente({ id }: { id?: number }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const editando = id !== undefined;
  const [cargando, setCargando] = useState(true);
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'GASTO' | 'INGRESO'>('GASTO');
  const [montoTexto, setMontoTexto] = useState('');
  const [billeteraId, setBilleteraId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('MENSUAL');
  const [fecha, setFecha] = useState(claveHoy());
  const [automatico, setAutomatico] = useState(false);
  const [activo, setActivo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const [b, c] = await Promise.all([listarBilleteras(db), listarCategorias(db)]);
      setBilleteras(b);
      setCategorias(c);
      if (id === undefined) {
        setBilleteraId(b[0]?.id ?? null);
      } else {
        const r = await obtenerRecurrente(db, id);
        if (!r || r.tipo === 'APORTE_META') {
          // Los aportes automáticos se editan desde su meta.
          if (r?.meta_id) router.replace(`/meta/${r.meta_id}`);
          else router.back();
          return;
        }
        setNombre(r.nombre);
        setTipo(r.tipo);
        setMontoTexto(centimosATexto(r.monto));
        setBilleteraId(r.billetera_id);
        setCategoriaId(r.categoria_id);
        setFrecuencia(r.frecuencia);
        setFecha(r.proxima_fecha);
        setAutomatico(r.automatico);
        setActivo(r.activo);
      }
      setCargando(false);
    })().catch((e) => Alert.alert('Error', String(e)));
  }, [db, id]);

  const billetera = billeteras.find((b) => b.id === billeteraId);

  const elegirFecha = () => {
    const [a, m, d] = fecha.split('-').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(a, m - 1, d),
      mode: 'date',
      onChange: (e, f) => {
        if (e.type === 'set' && f) setFecha(claveHoy(f));
      },
    });
  };

  const guardar = async () => {
    const monto = parsearMonto(montoTexto);
    if (!monto || monto <= 0 || !billeteraId || !categoriaId) {
      setError('Completa el monto, la billetera y la categoría.');
      return;
    }
    setGuardando(true);
    setError(null);
    const datos = { nombre, tipo, monto, billetera_id: billeteraId, categoria_id: categoriaId, frecuencia, proxima_fecha: fecha, automatico };
    try {
      if (id === undefined) await crearRecurrente(db, datos);
      else await actualizarRecurrente(db, id, { ...datos, activo });
      // Para avisarte el día que toca hace falta permiso de notificaciones.
      if (!automatico && (await pedirPermiso())) await actualizarAvisosRecurrentes(db).catch(() => {});
      router.back();
    } catch (e) {
      setError(e instanceof ErrorValidacion ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = () => {
    if (id === undefined) return;
    Alert.alert('¿Eliminar recurrente?', 'Los movimientos ya registrados se conservan.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarRecurrente(db, id);
          await actualizarAvisosRecurrentes(db).catch(() => {});
          router.back();
        },
      },
    ]);
  };

  if (cargando) return <ActivityIndicator style={styles.cargando} />;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editando ? 'Editar recurrente' : 'Nuevo recurrente' }} />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <SegmentedButtons
          value={tipo}
          onValueChange={(v) => {
            setTipo(v as 'GASTO' | 'INGRESO');
            setCategoriaId(null);
          }}
          buttons={[
            { value: 'GASTO', label: 'Gasto', icon: 'arrow-up' },
            { value: 'INGRESO', label: 'Ingreso', icon: 'arrow-down' },
          ]}
        />
        <TextInput label="Nombre" placeholder="Ej.: Alquiler, Internet, Sueldo" value={nombre} onChangeText={setNombre} mode="outlined" />
        <TextInput
          label="Monto"
          value={montoTexto}
          onChangeText={setMontoTexto}
          keyboardType="decimal-pad"
          mode="outlined"
          right={billetera ? <TextInput.Affix text={INFO_MONEDA[billetera.moneda].corto} /> : undefined}
        />
        <View style={styles.bloque}>
          <Text variant="labelLarge">{tipo === 'GASTO' ? 'Sale de' : 'Entra a'}</Text>
          <SelectorBilletera billeteras={billeteras} valor={billeteraId} onCambio={setBilleteraId} />
        </View>
        <View style={styles.bloque}>
          <Text variant="labelLarge">Categoría</Text>
          <View style={styles.chips}>
            {categorias
              .filter((c) => c.tipo === tipo)
              .map((c) => (
                <Chip
                  key={c.id}
                  icon={c.icono}
                  selected={c.id === categoriaId}
                  showSelectedCheck={false}
                  mode={c.id === categoriaId ? 'flat' : 'outlined'}
                  onPress={() => setCategoriaId(c.id)}
                >
                  {c.nombre}
                </Chip>
              ))}
          </View>
        </View>
        <View style={styles.bloque}>
          <Text variant="labelLarge">Frecuencia</Text>
          <View style={styles.chips}>
            {(Object.keys(NOMBRE_FRECUENCIA) as Frecuencia[]).map((f) => (
              <Chip key={f} selected={f === frecuencia} mode={f === frecuencia ? 'flat' : 'outlined'} onPress={() => setFrecuencia(f)}>
                {NOMBRE_FRECUENCIA[f]}
              </Chip>
            ))}
          </View>
        </View>
        <Button mode="outlined" icon="calendar" onPress={elegirFecha}>
          {`Próxima vez: ${fechaSimpleLegible(fecha)}`}
        </Button>
        <View style={styles.filaSwitch}>
          <View style={styles.flex}>
            <Text variant="labelLarge">Registrar automáticamente</Text>
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              {automatico
                ? 'Se anota solo en su fecha, sin preguntarte (ideal si el monto no cambia).'
                : 'Te aviso ese día y lo confirmas tú (por si el monto cambia, como la luz).'}
            </Text>
          </View>
          <Switch value={automatico} onValueChange={setAutomatico} />
        </View>
        {editando && (
          <View style={styles.filaSwitch}>
            <Text variant="labelLarge" style={styles.flex}>
              Activo
            </Text>
            <Switch value={activo} onValueChange={setActivo} />
          </View>
        )}
        {error && <HelperText type="error">{error}</HelperText>}
        <Button mode="contained" onPress={guardar} loading={guardando} disabled={guardando}>
          Guardar
        </Button>
        {editando && (
          <Button mode="text" icon="delete" textColor={tema.colors.error} onPress={eliminar}>
            Eliminar
          </Button>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cargando: { marginTop: 48 },
  contenido: { padding: 16, gap: 16, paddingBottom: 48 },
  bloque: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
