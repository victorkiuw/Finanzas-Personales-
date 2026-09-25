import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, HelperText, SegmentedButtons, Switch, Text, TextInput, useTheme } from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import { listarCategorias, type Categoria } from '../db/categorias';
import { crearCompra, DIAS_ENTRE_CUOTAS, montosCuotas, ultimaInicialPct } from '../db/cuotas';
import { formatearFechaCorta } from '../lib/fechas';
import { centimosATexto, formatearMonto, parsearMonto } from '../lib/moneda';
import type { DestinoPago } from '../lib/comision';
import { ComisionPago } from './ComisionPago';
import { PagoDesdeBilletera } from './PagoDesdeBilletera';
import { SelectorCategoria } from './SelectorCategoria';

const OPCIONES_CUOTAS = [1, 3, 6, 12];

/**
 * Nueva compra a cuotas (Cashea): total en dólares, inicial, cuotas cada 14 días.
 * Puede venir prellenada desde "Nuevo movimiento" al marcar "Pagué con Cashea".
 */
export function FormularioCompraCuotas({
  totalInicial,
  categoriaInicial,
  descripcionInicial,
  billeteraInicial,
  comisionInicial,
}: {
  /** Céntimos de dólar. */
  totalInicial?: number;
  categoriaInicial?: number;
  descripcionInicial?: string;
  billeteraInicial?: number;
  /** Comisión elegida en "Nuevo movimiento": sin comisión (null) o a quién se pagó. */
  comisionInicial?: DestinoPago | null;
} = {}) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [cargando, setCargando] = useState(true);
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [comercio, setComercio] = useState('');
  const [descripcion, setDescripcion] = useState(descripcionInicial ?? '');
  const [totalTexto, setTotalTexto] = useState(totalInicial ? centimosATexto(totalInicial) : '');
  const [enPorcentaje, setEnPorcentaje] = useState(true);
  const [inicialTexto, setInicialTexto] = useState('');
  const [cuotas, setCuotas] = useState(3);
  const [fecha, setFecha] = useState(() => new Date());
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [pagueInicial, setPagueInicial] = useState(true);
  const [billeteraId, setBilleteraId] = useState<number | null>(null);
  const [montoBilletera, setMontoBilletera] = useState<number | null>(null);
  const [comision, setComision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const [b, c, pct] = await Promise.all([listarBilleteras(db), listarCategorias(db, 'GASTO'), ultimaInicialPct(db)]);
      setBilleteras(b);
      setCategorias(c);
      setBilleteraId((b.find((x) => x.id === billeteraInicial) ?? b[0])?.id ?? null);
      setCategoriaId(
        (c.find((x) => x.id === categoriaInicial) ?? c.find((x) => x.nombre === 'Otros gastos') ?? c[0])?.id ?? null,
      );
      // Se propone la inicial usada la última vez.
      if (pct !== null) setInicialTexto(String(pct));
      setCargando(false);
    })().catch((e) => Alert.alert('Error', String(e)));
  }, [db, billeteraInicial, categoriaInicial]);

  const total = parsearMonto(totalTexto);
  const pct = Number(inicialTexto.trim().replace(',', '.'));
  const inicial = !total
    ? null
    : enPorcentaje
      ? inicialTexto.trim() === ''
        ? 0
        : Number.isFinite(pct) && pct >= 0 && pct < 100
          ? Math.round((total * pct) / 100)
          : null
      : inicialTexto.trim() === ''
        ? 0
        : parsearMonto(inicialTexto);
  const financiado = total && inicial !== null && inicial < total ? total - inicial : null;
  const montos = financiado ? montosCuotas(financiado, cuotas) : [];

  const elegirFecha = () =>
    DateTimePickerAndroid.open({
      value: fecha,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        const nueva = new Date(fecha);
        nueva.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        setFecha(nueva);
      },
    });

  const guardar = async () => {
    setError(null);
    if (!total || total <= 0) return setError('Escribe el total de la compra en dólares.');
    if (inicial === null) return setError('La inicial no es válida.');
    if (!categoriaId) return setError('Elige una categoría.');
    setGuardando(true);
    try {
      const id = await crearCompra(db, {
        comercio,
        descripcion,
        total,
        inicial,
        cuotas,
        fecha: fecha.toISOString(),
        categoria_id: categoriaId,
        billetera_id: pagueInicial && inicial > 0 ? billeteraId : null,
        monto_billetera: montoBilletera,
        comision: pagueInicial && inicial > 0 ? comision : 0,
      });
      router.replace(`/cuota/${id}`);
    } catch (e) {
      setError(e instanceof ErrorValidacion ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <ActivityIndicator style={styles.cargando} />;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Nueva compra a cuotas' }} />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <TextInput label="¿Dónde compraste?" value={comercio} onChangeText={setComercio} mode="outlined" autoFocus />
        <TextInput label="¿Qué compraste? (opcional)" value={descripcion} onChangeText={setDescripcion} mode="outlined" />
        <TextInput
          label="Total de la compra"
          value={totalTexto}
          onChangeText={setTotalTexto}
          keyboardType="decimal-pad"
          mode="outlined"
          right={<TextInput.Affix text="USD" />}
        />

        <View style={styles.bloque}>
          <Text variant="labelLarge">Inicial</Text>
          <SegmentedButtons
            value={enPorcentaje ? 'pct' : 'usd'}
            onValueChange={(v) => {
              setEnPorcentaje(v === 'pct');
              setInicialTexto('');
            }}
            buttons={[
              { value: 'pct', label: 'Porcentaje' },
              { value: 'usd', label: 'Monto' },
            ]}
          />
          <TextInput
            label={enPorcentaje ? 'Porcentaje de inicial' : 'Monto de la inicial'}
            value={inicialTexto}
            onChangeText={setInicialTexto}
            keyboardType="decimal-pad"
            mode="outlined"
            dense
            right={<TextInput.Affix text={enPorcentaje ? '%' : 'USD'} />}
          />
          {inicial !== null && total ? (
            <HelperText type="info">{`Inicial: ${formatearMonto(inicial, 'USD')} · a financiar: ${formatearMonto(Math.max(total - inicial, 0), 'USD')}`}</HelperText>
          ) : null}
        </View>

        <View style={styles.bloque}>
          <Text variant="labelLarge">Cuotas (cada {DIAS_ENTRE_CUOTAS} días)</Text>
          <SegmentedButtons
            value={String(cuotas)}
            onValueChange={(v) => setCuotas(Number(v))}
            buttons={OPCIONES_CUOTAS.map((n) => ({ value: String(n), label: n === 1 ? '1 (Cotidiano)' : String(n) }))}
          />
          {montos.length > 0 && (
            <HelperText type="info">
              {montos.length === 1
                ? `Una cuota de ${formatearMonto(montos[0], 'USD')}`
                : `${montos.length} cuotas de ${formatearMonto(montos[0], 'USD')}`}
            </HelperText>
          )}
        </View>

        <Button mode="outlined" icon="calendar" onPress={elegirFecha}>
          {`Compraste el ${formatearFechaCorta(fecha)}`}
        </Button>

        <View style={styles.bloque}>
          <Text variant="labelLarge">Categoría</Text>
          <SelectorCategoria categorias={categorias} valor={categoriaId} onCambio={setCategoriaId} />
        </View>

        {inicial !== null && inicial > 0 && (
          <View style={styles.bloque}>
            <View style={styles.fila}>
              <Text variant="labelLarge" style={styles.flex}>
                {`Registrar el pago de la inicial (${formatearMonto(inicial, 'USD')})`}
              </Text>
              <Switch value={pagueInicial} onValueChange={setPagueInicial} />
            </View>
            {pagueInicial && (
              <PagoDesdeBilletera
                billeteras={billeteras}
                usd={inicial}
                billeteraId={billeteraId}
                onBilletera={setBilleteraId}
                onMonto={setMontoBilletera}
              />
            )}
            {pagueInicial && (
              <ComisionPago
                key={billeteraId ?? 0}
                billetera={billeteras.find((b) => b.id === billeteraId) ?? null}
                monto={montoBilletera}
                onComision={setComision}
                activaInicial={
                  comisionInicial === undefined || billeteraId !== billeteraInicial ? undefined : comisionInicial !== null
                }
                destinoInicial={comisionInicial ?? undefined}
              />
            )}
            {!pagueInicial && (
              <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                {`La inicial (${formatearMonto(inicial, 'USD')}) queda como pagada sin descontarla de ninguna billetera (por ejemplo, si ya la anotaste).`}
              </Text>
            )}
          </View>
        )}

        {error && <HelperText type="error">{error}</HelperText>}
        <Button mode="contained" onPress={guardar} loading={guardando} disabled={guardando}>
          Guardar compra
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cargando: { marginTop: 48 },
  contenido: { padding: 16, gap: 16, paddingBottom: 48 },
  bloque: { gap: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
