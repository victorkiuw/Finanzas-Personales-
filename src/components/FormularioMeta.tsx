import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, HelperText, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';

import { ErrorValidacion } from '../db/billeteras';
import {
  actualizarMeta,
  crearMeta,
  eliminarMeta,
  establecerMetaArchivada,
  LARGO_MAXIMO_NOMBRE_META,
  obtenerMeta,
  type Meta,
} from '../db/metas';
import { centimosATexto, formatearMonto, INFO_MONEDA, MONEDAS, parsearMonto, type Moneda } from '../lib/moneda';
import { COLORES_BILLETERA } from '../lib/tema';
import { fechaSimpleLegible } from '../lib/fechas';

function aClaveFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function FormularioMeta({ id }: { id?: number }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const editando = id !== undefined;
  const [original, setOriginal] = useState<Meta | null>(null);
  const [cargando, setCargando] = useState(editando);
  const [nombre, setNombre] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [objetivoTexto, setObjetivoTexto] = useState('');
  const [fecha, setFecha] = useState<string | null>(null);
  const [color, setColor] = useState<string>(COLORES_BILLETERA[1]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (id === undefined) return;
    obtenerMeta(db, id)
      .then((m) => {
        if (!m) {
          router.back();
          return;
        }
        setOriginal(m);
        setNombre(m.nombre);
        setMoneda(m.moneda);
        setObjetivoTexto(centimosATexto(m.monto_objetivo));
        setFecha(m.fecha_objetivo);
        setColor(m.color_hex);
        setCargando(false);
      })
      .catch((e) => Alert.alert('Error', String(e)));
  }, [db, id]);

  const objetivo = parsearMonto(objetivoTexto);
  // Con aportes registrados la moneda queda fija (los montos están en esa moneda).
  const monedaBloqueada = original !== null && original.saldo !== 0;

  const elegirFecha = () => {
    const [a, m, d] = (fecha ?? aClaveFecha(new Date())).split('-').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(a, m - 1, d),
      mode: 'date',
      minimumDate: new Date(),
      onChange: (e, elegida) => {
        if (e.type === 'set' && elegida) setFecha(aClaveFecha(elegida));
      },
    });
  };

  const guardar = async () => {
    if (!objetivo || objetivo <= 0) {
      setError('Escribe un monto objetivo mayor que cero.');
      return;
    }
    setGuardando(true);
    setError(null);
    const datos = { nombre, moneda, monto_objetivo: objetivo, fecha_objetivo: fecha, color_hex: color };
    try {
      if (id === undefined) await crearMeta(db, datos);
      else await actualizarMeta(db, id, datos);
      router.back();
    } catch (e) {
      if (e instanceof ErrorValidacion) setError(e.message);
      else Alert.alert('Error', String(e));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = () => {
    if (id === undefined) return;
    Alert.alert('¿Eliminar meta?', 'Si tiene historial de aportes se archivará.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarMeta(db, id);
            router.dismissTo('/ahorros');
          } catch (e) {
            Alert.alert('No se pudo eliminar', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  if (cargando) return <ActivityIndicator style={styles.cargando} />;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editando ? 'Editar meta' : 'Nueva meta' }} />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <TextInput
          label="Nombre"
          value={nombre}
          onChangeText={setNombre}
          maxLength={LARGO_MAXIMO_NOMBRE_META}
          placeholder="Ej.: Fondo de emergencia, Viaje, Laptop"
          mode="outlined"
          autoFocus={!editando}
        />

        <View>
          <Text variant="labelLarge" style={styles.etiqueta}>
            Moneda de la meta
          </Text>
          <SegmentedButtons
            value={moneda}
            onValueChange={(v) => setMoneda(v as Moneda)}
            buttons={MONEDAS.map((m) => ({
              value: m,
              label: INFO_MONEDA[m].corto,
              disabled: monedaBloqueada && m !== moneda,
            }))}
          />
          {monedaBloqueada && <HelperText type="info">Retira el saldo para poder cambiar la moneda.</HelperText>}
        </View>

        <View>
          <TextInput
            label="Monto objetivo"
            value={objetivoTexto}
            onChangeText={setObjetivoTexto}
            keyboardType="decimal-pad"
            mode="outlined"
            right={<TextInput.Affix text={INFO_MONEDA[moneda].corto} />}
          />
          {objetivo === null && objetivoTexto.trim() !== '' ? (
            <HelperText type="error">Número no válido</HelperText>
          ) : objetivo ? (
            <HelperText type="info">{formatearMonto(objetivo, moneda)}</HelperText>
          ) : null}
        </View>

        <View style={styles.filaFecha}>
          <Button mode="outlined" icon="calendar" onPress={elegirFecha} style={styles.flex}>
            {fecha ? `Para el ${fechaSimpleLegible(fecha)}` : 'Fecha objetivo (opcional)'}
          </Button>
          {fecha && <Button onPress={() => setFecha(null)}>Quitar</Button>}
        </View>

        <View>
          <Text variant="labelLarge" style={styles.etiqueta}>
            Color
          </Text>
          <View style={styles.colores}>
            {COLORES_BILLETERA.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: color === c }}
                accessibilityLabel={`Color ${c}`}
                style={[styles.color, { backgroundColor: c }, color === c && { borderColor: tema.colors.onSurface }]}
              />
            ))}
          </View>
        </View>

        {error && <HelperText type="error">{error}</HelperText>}
        <Button mode="contained" onPress={guardar} loading={guardando} disabled={guardando}>
          Guardar
        </Button>

        {editando && original && (
          <View style={styles.acciones}>
            {original.saldo === 0 && (
              <Button
                mode="outlined"
                icon={original.archivada ? 'archive-arrow-up' : 'archive'}
                onPress={async () => {
                  await establecerMetaArchivada(db, original.id, !original.archivada);
                  router.back();
                }}
              >
                {original.archivada ? 'Restaurar' : 'Archivar'}
              </Button>
            )}
            <Button mode="text" icon="delete" textColor={tema.colors.error} onPress={confirmarEliminar}>
              Eliminar
            </Button>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cargando: { marginTop: 48 },
  contenido: { padding: 16, gap: 16, paddingBottom: 48 },
  etiqueta: { marginBottom: 8 },
  filaFecha: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  colores: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  color: { width: 40, height: 40, borderRadius: 20, borderColor: 'transparent', borderWidth: 3 },
  acciones: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
});
