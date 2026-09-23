import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  HelperText,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { GraficoLineas } from '../../components/GraficoLineas';
import { useTasas } from '../../components/TasasProvider';
import { alinearHistoriales, listarHistorial } from '../../db/tasas';
import { NOMBRE_PAR, TODOS_LOS_PARES, type Par } from '../../lib/api-tasas';
import { brecha, convertirNatural, type TasasNaturales } from '../../lib/conversion';
import { fechaSimpleLegible, formatearFechaCorta, haceCuanto } from '../../lib/fechas';
import { formatearMonto, INFO_MONEDA, MONEDAS, parsearMonto, type Moneda } from '../../lib/moneda';
import { formatearTasa, parsearTasa, tasaATexto } from '../../lib/tasa';

const RANGOS = [
  { dias: 30, etiqueta: '30 días' },
  { dias: 90, etiqueta: '3 meses' },
  { dias: 365, etiqueta: '1 año' },
];

/** Colores de la paleta validada (contraste y daltonismo): BCV azul, USDT naranja, euro aguamarina. */
function coloresTasas(oscuro: boolean): Record<Par, string> {
  return oscuro
    ? { BCV: '#3987e5', PARALELO: '#d95926', EURO: '#199e70' }
    : { BCV: '#2a78d6', PARALELO: '#eb6834', EURO: '#1baf7a' };
}

const DESCRIPCION_PAR: Record<Par, string> = {
  BCV: 'Dólar BCV (oficial)',
  PARALELO: 'USDT (mercado / paralelo)',
  EURO: 'Euro BCV (oficial)',
};

type Historial = { dia: string; tasa: number }[];

/** Qué tasa se usó para pasar de una moneda a otra en la calculadora. */
function etiquetaTasa(de: Moneda, a: Moneda): string {
  if ((de === 'USD' || de === 'USDT') && (a === 'USD' || a === 'USDT')) return '1:1';
  const otra = de === 'BS' ? a : a === 'BS' ? de : null;
  if (otra === 'USD') return 'tasa BCV';
  if (otra === 'USDT') return 'tasa USDT';
  if (otra === 'EUR') return 'euro BCV';
  return 'euro/dólar BCV';
}

export default function PantallaTasas() {
  const tema = useTheme();
  const db = useSQLiteContext();
  const { tasas, actualizando, error, actualizar, guardarManual, versionHistorial } = useTasas();
  const [rango, setRango] = useState(30);
  const [historial, setHistorial] = useState<Record<Par, Historial> | null>(null);

  useEffect(() => {
    Promise.all(TODOS_LOS_PARES.map((p) => listarHistorial(db, p)))
      .then(([bcv, paralelo, euro]) => setHistorial({ BCV: bcv, PARALELO: paralelo, EURO: euro }))
      .catch(() => {});
  }, [db, versionHistorial]);

  const desde = new Date();
  desde.setDate(desde.getDate() - rango);
  const clavedesde = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}-${String(desde.getDate()).padStart(2, '0')}`;
  // El euro solo se dibuja si ya hay historial suyo.
  const paresGrafico = TODOS_LOS_PARES.filter((p) => p !== 'EURO' || (historial?.EURO.length ?? 0) > 0);
  const alineado = historial ? alinearHistoriales(paresGrafico.map((p) => historial[p]), clavedesde) : null;
  const colores = coloresTasas(tema.dark);
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [montoTexto, setMontoTexto] = useState('1');
  const [editando, setEditando] = useState<Par | null>(null);
  const [tasaManual, setTasaManual] = useState('');

  const monto = parsearMonto(montoTexto);
  const otras = MONEDAS.filter((m) => m !== moneda);
  const naturales: TasasNaturales = {
    bcv: tasas.BCV?.tasa ?? null,
    usdt: tasas.PARALELO?.tasa ?? null,
    euro: tasas.EURO?.tasa ?? null,
  };
  const bcv = tasas.BCV?.tasa;
  const paralelo = tasas.PARALELO?.tasa;

  const abrirEdicion = (par: Par) => {
    setTasaManual(tasas[par] ? tasaATexto(tasas[par].tasa) : '');
    setEditando(par);
  };

  const guardar = async () => {
    const valor = parsearTasa(tasaManual);
    if (!editando || !valor) return;
    await guardarManual(editando, valor);
    setEditando(null);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <Text variant="titleMedium">Calculadora</Text>
        <SegmentedButtons
          value={moneda}
          onValueChange={(v) => setMoneda(v as Moneda)}
          buttons={MONEDAS.map((m) => ({ value: m, label: INFO_MONEDA[m].corto }))}
        />
        <TextInput
          label="Monto"
          value={montoTexto}
          onChangeText={setMontoTexto}
          keyboardType="decimal-pad"
          mode="outlined"
          style={styles.monto}
          selectTextOnFocus
          right={<TextInput.Affix text={INFO_MONEDA[moneda].corto} />}
        />
        {monto === null && montoTexto.trim() !== '' && <HelperText type="error">Número no válido</HelperText>}

        <Card mode="outlined">
          <Card.Content style={styles.resultado}>
            <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
              Equivale a
            </Text>
            {otras.map((m) => {
              const v = monto !== null ? convertirNatural(monto, moneda, m, naturales) : null;
              // Dólares ↔ bolívares: también a la tasa USDT, que es la de la calle.
              const alterna =
                monto !== null && ((moneda === 'USD' && m === 'BS') || (moneda === 'BS' && m === 'USD')) && naturales.usdt
                  ? convertirNatural(monto, moneda === 'USD' ? 'USDT' : 'BS', moneda === 'USD' ? 'BS' : 'USDT', naturales)
                  : null;
              return (
                <View key={m} style={styles.lineaResultado}>
                  <Text variant="headlineSmall" style={styles.cifra}>
                    {v !== null ? formatearMonto(v, m) : '—'}
                  </Text>
                  <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                    {etiquetaTasa(moneda, m)}
                    {alterna !== null ? ` · a tasa USDT: ${formatearMonto(alterna, m)}` : ''}
                  </Text>
                </View>
              );
            })}
          </Card.Content>
        </Card>
        <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
          Cada moneda con su tasa: los dólares con la BCV, el USDT con la tasa USDT y los euros con el euro BCV. USD y
          USDT se toman 1:1 entre sí.
        </Text>

        <Divider style={styles.divisor} />

        <View style={styles.filaTitulo}>
          <Text variant="titleMedium" style={styles.flex}>
            Tasas del día
          </Text>
          <Button icon="refresh" mode="contained-tonal" loading={actualizando} disabled={actualizando} onPress={() => actualizar(true)}>
            Actualizar
          </Button>
        </View>
        {error && (
          <HelperText type="error">{`${error} Se usa la última tasa guardada.`}</HelperText>
        )}

        {TODOS_LOS_PARES.map((par) => {
          const t = tasas[par];
          return (
            <Card key={par} mode="contained" onPress={() => abrirEdicion(par)}>
              <Card.Content style={styles.tasa}>
                <View style={styles.flex}>
                  <Text variant="labelLarge">{DESCRIPCION_PAR[par]}</Text>
                  <Text variant="headlineMedium" style={styles.cifra}>
                    {t ? `${formatearTasa(t.tasa)}` : '—'}
                    <Text variant="bodyMedium">{t ? (par === 'EURO' ? '  Bs./€' : '  Bs./USD') : ''}</Text>
                  </Text>
                  <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                    {!t
                      ? 'Toca para escribirla a mano'
                      : t.origen === 'MANUAL'
                        ? `Escrita a mano ${haceCuanto(t.ultima_actualizacion)}`
                        : `Cotización del ${formatearFechaCorta(new Date(t.ultima_actualizacion))} · consultada ${t.consultada_en ? haceCuanto(t.consultada_en) : ''}`}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          );
        })}
        {bcv && paralelo && (
          <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
            {`Brecha: el USDT está ${brecha(bcv, paralelo).toFixed(1).replace('.', ',')}% sobre el BCV.`}
          </Text>
        )}
        <Card mode="outlined">
          <Card.Title title="Historial" subtitle="Desliza el dedo sobre el gráfico para ver cada día" />
          <Card.Content style={styles.historial}>
            <View style={styles.chips}>
              {RANGOS.map((r) => (
                <Chip key={r.dias} compact selected={rango === r.dias} showSelectedCheck={false} mode={rango === r.dias ? 'flat' : 'outlined'} onPress={() => setRango(r.dias)}>
                  {r.etiqueta}
                </Chip>
              ))}
            </View>
            {alineado && (
              <GraficoLineas
                etiquetas={alineado.dias.map(fechaSimpleLegible)}
                series={paresGrafico.map((p, i) => ({ nombre: NOMBRE_PAR[p], color: colores[p], valores: alineado.valores[i] }))}
                formatear={formatearTasa}
              />
            )}
          </Card.Content>
        </Card>
        <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
          Fuente: ve.dolarapi.com. Se actualizan solas cada 30 minutos cuando hay internet; toca una tasa para
          corregirla a mano.
        </Text>
      </ScrollView>

      <Portal>
        <Dialog visible={editando !== null} onDismiss={() => setEditando(null)}>
          <Dialog.Title>{editando ? `Tasa ${NOMBRE_PAR[editando]}` : ''}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={editando === 'EURO' ? 'Bs. por euro' : 'Bs. por dólar'}
              value={tasaManual}
              onChangeText={setTasaManual}
              keyboardType="decimal-pad"
              mode="outlined"
              autoFocus
            />
            <HelperText type="info">Se reemplazará en la próxima actualización automática.</HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditando(null)}>Cancelar</Button>
            <Button onPress={guardar} disabled={!parsearTasa(tasaManual)}>
              Guardar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: 16, gap: 12, paddingBottom: 48 },
  monto: { fontSize: 24 },
  resultado: { gap: 8 },
  lineaResultado: { gap: 0 },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  divisor: { marginVertical: 8 },
  filaTitulo: { flexDirection: 'row', alignItems: 'center' },
  tasa: { flexDirection: 'row', alignItems: 'center' },
  historial: { gap: 12 },
  chips: { flexDirection: 'row', gap: 8 },
});
