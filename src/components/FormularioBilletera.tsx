import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  HelperText,
  IconButton,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import {
  actualizarBilletera,
  contarMovimientos,
  crearBilletera,
  eliminarBilletera,
  ErrorValidacion,
  establecerArchivada,
  LARGO_MAXIMO_NOMBRE,
  obtenerBilletera,
  type Billetera,
} from '../db/billeteras';
import { centimosATexto, formatearMonto, INFO_MONEDA, MONEDAS, parsearMonto, type Moneda } from '../lib/moneda';
import { COLORES_BILLETERA, ICONOS_BILLETERA } from '../lib/tema';

interface Props {
  /** Si no se indica, el formulario crea una billetera nueva. */
  id?: number;
}

export function FormularioBilletera({ id }: Props) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const editando = id !== undefined;

  const [original, setOriginal] = useState<Billetera | null>(null);
  const [cargando, setCargando] = useState(editando);
  const [movimientos, setMovimientos] = useState(0);
  const [nombre, setNombre] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [saldoTexto, setSaldoTexto] = useState('');
  const [icono, setIcono] = useState<string>(ICONOS_BILLETERA[0]);
  const [color, setColor] = useState<string>(COLORES_BILLETERA[0]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (id === undefined) return;
    (async () => {
      const b = await obtenerBilletera(db, id);
      if (!b) {
        Alert.alert('No encontrada', 'Esta billetera ya no existe.');
        router.back();
        return;
      }
      setOriginal(b);
      setNombre(b.nombre);
      setMoneda(b.moneda);
      setSaldoTexto(centimosATexto(b.balance_inicial));
      setIcono(b.icono);
      setColor(b.color_hex);
      setMovimientos(await contarMovimientos(db, id));
      setCargando(false);
    })().catch((e) => Alert.alert('Error', String(e)));
  }, [db, id]);

  const saldoInicial = saldoTexto.trim() === '' ? 0 : parsearMonto(saldoTexto);
  const monedaBloqueada = movimientos > 0;

  const guardar = async () => {
    if (saldoInicial === null) {
      setError('El saldo inicial no es un número válido.');
      return;
    }
    setGuardando(true);
    setError(null);
    const datos = { nombre, moneda, balance_inicial: saldoInicial, icono, color_hex: color };
    try {
      if (id === undefined) await crearBilletera(db, datos);
      else await actualizarBilletera(db, id, datos);
      router.back();
    } catch (e) {
      if (e instanceof ErrorValidacion) setError(e.message);
      else Alert.alert('Error', String(e));
    } finally {
      setGuardando(false);
    }
  };

  const alternarArchivada = async () => {
    if (id === undefined || !original) return;
    await establecerArchivada(db, id, !original.archivada);
    router.back();
  };

  const confirmarEliminar = () => {
    if (id === undefined) return;
    const mensaje = monedaBloqueada
      ? `Tiene ${movimientos} movimiento(s), así que se archivará para conservar tu historial.`
      : 'Esta acción no se puede deshacer.';
    Alert.alert('¿Eliminar billetera?', mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: monedaBloqueada ? 'Archivar' : 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarBilletera(db, id);
            router.back();
          } catch (e) {
            Alert.alert('Error', String(e));
          }
        },
      },
    ]);
  };

  if (cargando) return <ActivityIndicator style={styles.cargando} />;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editando ? 'Editar billetera' : 'Nueva billetera' }} />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <TextInput
          label="Nombre"
          value={nombre}
          onChangeText={setNombre}
          maxLength={LARGO_MAXIMO_NOMBRE}
          placeholder="Ej.: Banesco, Efectivo, Binance"
          mode="outlined"
          autoFocus={!editando}
        />

        <View>
          <Text variant="labelLarge" style={styles.etiqueta}>
            Moneda
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
          {monedaBloqueada && (
            <HelperText type="info">La moneda no se puede cambiar porque ya tiene movimientos.</HelperText>
          )}
        </View>

        <View>
          <TextInput
            label="Saldo inicial"
            value={saldoTexto}
            onChangeText={setSaldoTexto}
            keyboardType="decimal-pad"
            placeholder="0,00"
            mode="outlined"
            right={<TextInput.Affix text={INFO_MONEDA[moneda].corto} />}
          />
          <HelperText type={saldoInicial === null ? 'error' : 'info'}>
            {saldoInicial === null
              ? 'Número no válido'
              : `${formatearMonto(saldoInicial, moneda)} · lo que tenías antes de empezar a registrar`}
          </HelperText>
        </View>

        <View>
          <Text variant="labelLarge" style={styles.etiqueta}>
            Icono
          </Text>
          <View style={styles.fila}>
            {ICONOS_BILLETERA.map((i) => (
              <IconButton
                key={i}
                icon={i}
                mode={icono === i ? 'contained' : 'outlined'}
                selected={icono === i}
                onPress={() => setIcono(i)}
                accessibilityLabel={`Icono ${i}`}
              />
            ))}
          </View>
        </View>

        <View>
          <Text variant="labelLarge" style={styles.etiqueta}>
            Color
          </Text>
          <View style={styles.fila}>
            {COLORES_BILLETERA.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: color === c }}
                accessibilityLabel={`Color ${c}`}
                style={[
                  styles.color,
                  { backgroundColor: c },
                  color === c && { borderColor: tema.colors.onSurface, borderWidth: 3 },
                ]}
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
            <Button mode="outlined" icon={original.archivada ? 'archive-arrow-up' : 'archive'} onPress={alternarArchivada}>
              {original.archivada ? 'Restaurar' : 'Archivar'}
            </Button>
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
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  color: { width: 40, height: 40, borderRadius: 20, borderColor: 'transparent', borderWidth: 3 },
  acciones: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
});
