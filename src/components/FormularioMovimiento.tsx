import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  HelperText,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import { listarCategorias, type Categoria } from '../db/categorias';
import {
  actualizarMovimiento,
  crearMovimiento,
  eliminarMovimiento,
  LARGO_MAXIMO_NOTA,
  listarMovimientos,
  obtenerMovimiento,
  type Movimiento,
  type TipoMovimiento,
} from '../db/movimientos';
import { formatearFechaCorta, formatearHora } from '../lib/fechas';
import { centimosATexto, formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';
import { calcularTasa, formatearTasa, hayBolivar, parsearTasa, recibidoConTasa, tasaATexto, unidadTasa } from '../lib/tasa';
import { NOMBRE_PAR, PARES } from '../lib/api-tasas';
import { SelectorBilletera } from './SelectorBilletera';
import { useTasas } from './TasasProvider';

interface Props {
  /** Si no se indica, se crea un movimiento nuevo. */
  id?: number;
  tipoInicial?: TipoMovimiento;
  billeteraInicial?: number;
}

const TIPOS: { value: TipoMovimiento; label: string; icon: string }[] = [
  { value: 'GASTO', label: 'Gasto', icon: 'arrow-up' },
  { value: 'INGRESO', label: 'Ingreso', icon: 'arrow-down' },
  { value: 'TRANSFERENCIA', label: 'Transferir', icon: 'swap-horizontal' },
];

export function FormularioMovimiento({ id, tipoInicial = 'GASTO', billeteraInicial }: Props) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { tasas } = useTasas();
  const editando = id !== undefined;

  const [cargando, setCargando] = useState(true);
  const [original, setOriginal] = useState<Movimiento | null>(null);
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [tipo, setTipo] = useState<TipoMovimiento>(tipoInicial);
  const [montoTexto, setMontoTexto] = useState('');
  const [origenId, setOrigenId] = useState<number | null>(null);
  const [destinoId, setDestinoId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [recibidoTexto, setRecibidoTexto] = useState('');
  const [tasaTexto, setTasaTexto] = useState('');
  const [fecha, setFecha] = useState(() => new Date());
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const [todas, cats] = await Promise.all([
        listarBilleteras(db, { incluirArchivadas: true }),
        listarCategorias(db),
      ]);
      setCategorias(cats);

      if (id === undefined) {
        const activas = todas.filter((b) => !b.archivada);
        setBilleteras(activas);
        // Por defecto, la billetera indicada o la del último movimiento registrado.
        const [ultimo] = await listarMovimientos(db, { limite: 1 });
        const preferida = [billeteraInicial, ultimo?.billetera_origen_id].find((bid) =>
          activas.some((b) => b.id === bid),
        );
        setOrigenId(preferida ?? activas[0]?.id ?? null);
        setCargando(false);
        return;
      }

      const m = await obtenerMovimiento(db, id);
      if (!m) {
        Alert.alert('No encontrado', 'Este movimiento ya no existe.');
        router.back();
        return;
      }
      // Se muestran las activas más las archivadas que use este movimiento.
      setBilleteras(
        todas.filter((b) => !b.archivada || b.id === m.billetera_origen_id || b.id === m.billetera_destino_id),
      );
      setOriginal(m);
      if (m.tipo === 'GASTO' || m.tipo === 'INGRESO' || m.tipo === 'TRANSFERENCIA') setTipo(m.tipo);
      setMontoTexto(centimosATexto(m.monto));
      setOrigenId(m.billetera_origen_id);
      setDestinoId(m.billetera_destino_id);
      setCategoriaId(m.categoria_id);
      if (m.monto_destino !== null) setRecibidoTexto(centimosATexto(m.monto_destino));
      if (m.tasa_cambio !== null) setTasaTexto(tasaATexto(m.tasa_cambio));
      setFecha(new Date(m.fecha));
      setNota(m.nota ?? '');
      setCargando(false);
    })().catch((e) => Alert.alert('Error', String(e)));
  }, [db, id, billeteraInicial]);

  const origen = billeteras.find((b) => b.id === origenId) ?? null;
  const destino = billeteras.find((b) => b.id === destinoId) ?? null;
  const esTransferencia = tipo === 'TRANSFERENCIA';
  const conCambio = esTransferencia && origen && destino && origen.moneda !== destino.moneda;
  const monto = parsearMonto(montoTexto);
  const recibido = parsearMonto(recibidoTexto);
  const tasa = parsearTasa(tasaTexto);

  /** Recalcula lo recibido a partir de la tasa escrita (la tasa manda). */
  const sincronizarRecibido = (nuevoMonto: number | null, o = origen, d = destino) => {
    if (!o || !d || o.moneda === d.moneda || !nuevoMonto || nuevoMonto <= 0 || !tasa) return;
    setRecibidoTexto(centimosATexto(recibidoConTasa(o.moneda, d.moneda, nuevoMonto, tasa)));
  };

  const cambiarMonto = (t: string) => {
    setMontoTexto(t);
    sincronizarRecibido(parsearMonto(t));
  };

  const cambiarTasa = (t: string) => {
    setTasaTexto(t);
    const nueva = parsearTasa(t);
    if (origen && destino && monto && monto > 0 && nueva) {
      setRecibidoTexto(centimosATexto(recibidoConTasa(origen.moneda, destino.moneda, monto, nueva)));
    }
  };

  const cambiarRecibido = (t: string) => {
    setRecibidoTexto(t);
    const r = parsearMonto(t);
    if (origen && destino && monto && monto > 0 && r && r > 0) {
      setTasaTexto(tasaATexto(calcularTasa(origen.moneda, destino.moneda, monto, r)));
    }
  };

  const cambiarOrigen = (bid: number) => {
    setOrigenId(bid);
    if (bid === destinoId) setDestinoId(null);
    sincronizarRecibido(monto, billeteras.find((b) => b.id === bid), destino);
  };

  const cambiarDestino = (bid: number) => {
    setDestinoId(bid);
    sincronizarRecibido(monto, origen, billeteras.find((b) => b.id === bid));
  };

  const cambiarTipo = (t: TipoMovimiento) => {
    setTipo(t);
    if (categorias.find((c) => c.id === categoriaId)?.tipo !== t) setCategoriaId(null);
    setError(null);
  };

  const elegirFecha = (modo: 'date' | 'time') => {
    DateTimePickerAndroid.open({
      value: fecha,
      mode: modo,
      is24Hour: true,
      maximumDate: modo === 'date' ? new Date() : undefined,
      onChange: (evento, elegida) => {
        if (evento.type !== 'set' || !elegida) return;
        const nueva = new Date(fecha);
        if (modo === 'date') nueva.setFullYear(elegida.getFullYear(), elegida.getMonth(), elegida.getDate());
        else nueva.setHours(elegida.getHours(), elegida.getMinutes(), 0, 0);
        setFecha(nueva);
      },
    });
  };

  const guardar = async () => {
    if (!monto || monto <= 0) {
      setError('Escribe un monto mayor que cero.');
      return;
    }
    if (!origenId) {
      setError('Elige una billetera.');
      return;
    }
    if (conCambio && (!recibido || recibido <= 0)) {
      setError('Indica cuánto recibiste o la tasa pactada.');
      return;
    }
    setGuardando(true);
    setError(null);
    const datos = {
      tipo,
      monto,
      fecha: fecha.toISOString(),
      billetera_origen_id: origenId,
      categoria_id: esTransferencia ? null : categoriaId,
      billetera_destino_id: esTransferencia ? destinoId : null,
      monto_destino: conCambio ? recibido : null,
      nota,
    };
    try {
      if (id === undefined) await crearMovimiento(db, datos);
      else await actualizarMovimiento(db, id, datos);
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
    Alert.alert('¿Eliminar movimiento?', 'Los saldos se recalcularán.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarMovimiento(db, id);
            router.back();
          } catch (e) {
            Alert.alert('Error', String(e));
          }
        },
      },
    ]);
  };

  if (cargando) return <ActivityIndicator style={styles.cargando} />;

  const titulo = editando ? 'Editar movimiento' : 'Nuevo movimiento';

  if (original?.meta_id != null) {
    return (
      <View style={styles.contenido}>
        <Stack.Screen options={{ title: titulo }} />
        <Text variant="bodyLarge">Este movimiento pertenece a una meta de ahorro y se gestiona desde Ahorros.</Text>
      </View>
    );
  }

  if (billeteras.length === 0) {
    return (
      <View style={styles.contenido}>
        <Stack.Screen options={{ title: titulo }} />
        <Text variant="bodyLarge">Primero crea una billetera.</Text>
        <Button mode="contained" onPress={() => router.replace('/billetera/nueva')}>
          Crear billetera
        </Button>
      </View>
    );
  }

  const categoriasTipo = categorias.filter((c) => c.tipo === tipo);
  // Aviso (no bloquea) si un movimiento nuevo deja la billetera en negativo.
  const quedaNegativo =
    !editando && tipo !== 'INGRESO' && origen && monto && monto > 0 && origen.saldo - monto < 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: titulo }} />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <SegmentedButtons
          value={tipo}
          onValueChange={(v) => cambiarTipo(v as TipoMovimiento)}
          buttons={TIPOS.map((t) => ({ ...t, showSelectedCheck: false }))}
        />

        <View>
          <TextInput
            label={esTransferencia ? 'Monto enviado' : 'Monto'}
            value={montoTexto}
            onChangeText={cambiarMonto}
            keyboardType="decimal-pad"
            placeholder="0,00"
            mode="outlined"
            autoFocus={!editando}
            style={styles.monto}
            right={origen ? <TextInput.Affix text={INFO_MONEDA[origen.moneda].corto} /> : undefined}
          />
          {monto === null && montoTexto.trim() !== '' ? (
            <HelperText type="error">Número no válido</HelperText>
          ) : quedaNegativo ? (
            <HelperText type="info" style={{ color: tema.colors.error }}>
              {`${origen.nombre} quedará en ${formatearMonto(origen.saldo - monto, origen.moneda)}`}
            </HelperText>
          ) : origen && monto ? (
            <HelperText type="info">{formatearMonto(monto, origen.moneda)}</HelperText>
          ) : null}
        </View>

        <View style={styles.bloque}>
          <Text variant="labelLarge">
            {tipo === 'INGRESO' ? 'Entra a' : esTransferencia ? 'Desde' : 'Sale de'}
          </Text>
          <SelectorBilletera billeteras={billeteras} valor={origenId} onCambio={cambiarOrigen} />
          {origen && (
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              {`Saldo: ${formatearMonto(origen.saldo, origen.moneda)}`}
            </Text>
          )}
        </View>

        {esTransferencia ? (
          <>
            <View style={styles.bloque}>
              <Text variant="labelLarge">Hacia</Text>
              <SelectorBilletera
                billeteras={billeteras}
                valor={destinoId}
                onCambio={cambiarDestino}
                excluir={origenId}
              />
            </View>
            {conCambio && (
              <View style={styles.filaCampos}>
                <TextInput
                  label={`Tasa (${unidadTasa(origen.moneda, destino.moneda)})`}
                  value={tasaTexto}
                  onChangeText={cambiarTasa}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  style={styles.flex}
                />
                <TextInput
                  label="Recibido"
                  value={recibidoTexto}
                  onChangeText={cambiarRecibido}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  style={styles.flex}
                  right={<TextInput.Affix text={INFO_MONEDA[destino.moneda].corto} />}
                />
              </View>
            )}
            {conCambio && hayBolivar(origen.moneda, destino.moneda) && (
              <View style={styles.chips}>
                {PARES.filter((p) => tasas[p]).map((p) => (
                  <Chip key={p} compact icon="lightning-bolt" onPress={() => cambiarTasa(tasaATexto(tasas[p]!.tasa))}>
                    {`${NOMBRE_PAR[p]} ${formatearTasa(tasas[p]!.tasa)}`}
                  </Chip>
                ))}
              </View>
            )}
            {conCambio && recibido !== null && recibido > 0 && (
              <HelperText type="info">
                {`${destino.nombre} recibe ${formatearMonto(recibido, destino.moneda)}. Las comisiones regístralas como gasto aparte.`}
              </HelperText>
            )}
          </>
        ) : (
          <View style={styles.bloque}>
            <Text variant="labelLarge">Categoría</Text>
            <View style={styles.chips}>
              {categoriasTipo.map((c) => {
                const elegida = c.id === categoriaId;
                return (
                  <Chip
                    key={c.id}
                    icon={c.icono}
                    selected={elegida}
                    showSelectedCheck={false}
                    mode={elegida ? 'flat' : 'outlined'}
                    onPress={() => setCategoriaId(c.id)}
                    style={elegida ? { backgroundColor: c.color_hex } : undefined}
                    textStyle={elegida ? styles.textoElegido : undefined}
                    selectedColor={elegida ? '#FFFFFF' : undefined}
                  >
                    {c.nombre}
                  </Chip>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.filaCampos}>
          <Button mode="outlined" icon="calendar" onPress={() => elegirFecha('date')} style={styles.flex}>
            {formatearFechaCorta(fecha)}
          </Button>
          <Button mode="outlined" icon="clock-outline" onPress={() => elegirFecha('time')}>
            {formatearHora(fecha.toISOString())}
          </Button>
        </View>

        <TextInput
          label="Nota (opcional)"
          value={nota}
          onChangeText={setNota}
          maxLength={LARGO_MAXIMO_NOTA}
          mode="outlined"
          multiline
        />

        {error && <HelperText type="error">{error}</HelperText>}

        <Button mode="contained" onPress={guardar} loading={guardando} disabled={guardando}>
          Guardar
        </Button>
        {editando && (
          <Button mode="text" icon="delete" textColor={tema.colors.error} onPress={confirmarEliminar}>
            Eliminar movimiento
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
  monto: { fontSize: 24 },
  bloque: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filaCampos: { flexDirection: 'row', gap: 8 },
  textoElegido: { color: '#FFFFFF' },
});
