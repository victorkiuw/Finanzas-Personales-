import * as Sharing from 'expo-sharing';
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { captureRef } from 'react-native-view-shot';

import { Dona } from '../components/Dona';
import { SelectorMes } from '../components/SelectorMes';
import { useTasas } from '../components/TasasProvider';
import { useConversor } from '../components/useConversor';
import { filasDeReporte, resumirPeriodo, type FilaReporte } from '../db/reportes';
import { variacion } from '../lib/analisis';
import { nombreMes, rangoMes } from '../lib/fechas';
import { formatearMonto } from '../lib/moneda';

/** Resumen del mes como una tarjeta bonita, para guardarla o compartirla por WhatsApp. */
export default function ResumenDelMes() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { monedaBase } = useTasas();
  const conversor = useConversor();
  const tarjeta = useRef<View>(null);
  const [mes, setMes] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [filas, setFilas] = useState<FilaReporte[]>([]);
  const [anteriores, setAnteriores] = useState<FilaReporte[]>([]);
  const [compartiendo, setCompartiendo] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const r = rangoMes(mes);
      const a = rangoMes(mes, -1);
      Promise.all([filasDeReporte(db, r.desde, r.hasta), filasDeReporte(db, a.desde, a.hasta)])
        .then(([f, g]) => {
          setFilas(f);
          setAnteriores(g);
        })
        .catch(() => {});
    }, [db, mes]),
  );

  const resumen = useMemo(() => (conversor ? resumirPeriodo(filas, conversor, monedaBase) : null), [filas, conversor, monedaBase]);
  const previo = useMemo(() => (conversor ? resumirPeriodo(anteriores, conversor, monedaBase) : null), [anteriores, conversor, monedaBase]);

  const compartir = async () => {
    if (!tarjeta.current) return;
    setCompartiendo(true);
    try {
      const uri = await captureRef(tarjeta, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir resumen' });
      else Alert.alert('Compartir', 'Este teléfono no permite compartir archivos.');
    } catch (e) {
      Alert.alert('No se pudo crear la imagen', String(e));
    } finally {
      setCompartiendo(false);
    }
  };

  const top = resumen?.gastosPorCategoria.slice(0, 5) ?? [];
  const resto = (resumen?.gastosPorCategoria.slice(5) ?? []).reduce((s, c) => s + c.total, 0);
  const cambioGastos = resumen && previo ? variacion(resumen.gastos, previo.gastos) : null;
  // La tarjeta siempre en oscuro con lima, para que se vea igual al compartirla.
  const c = { fondo: '#0B0C0E', tarjeta: '#1D1E21', texto: '#F2F3EE', suave: '#A3A6AD', verde: '#4ADE80', rojo: '#F87171' };

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: 'Resumen del mes' }} />
      <SelectorMes mes={mes} onCambio={setMes} />

      <View ref={tarjeta} collapsable={false} style={[styles.tarjeta, { backgroundColor: c.fondo }]}>
        <Text style={[styles.marca, { color: tema.colors.primaryContainer }]}>Finanzas</Text>
        <Text style={[styles.titulo, { color: c.texto }]}>{`Mi resumen de ${nombreMes(mes)}`}</Text>
        {resumen && (
          <>
            <View style={styles.fila}>
              <View style={[styles.kpi, { backgroundColor: c.tarjeta }]}>
                <Text style={{ color: c.suave }}>Ingresos</Text>
                <Text style={[styles.cifra, { color: c.verde }]}>{formatearMonto(resumen.ingresos, monedaBase)}</Text>
              </View>
              <View style={[styles.kpi, { backgroundColor: c.tarjeta }]}>
                <Text style={{ color: c.suave }}>Gastos</Text>
                <Text style={[styles.cifra, { color: c.rojo }]}>{formatearMonto(resumen.gastos, monedaBase)}</Text>
              </View>
            </View>
            <View style={[styles.kpiAncho, { backgroundColor: c.tarjeta }]}>
              <Text style={{ color: c.suave }}>Balance del mes</Text>
              <Text style={[styles.cifra, { color: resumen.balance >= 0 ? c.verde : c.rojo }]}>
                {`${resumen.balance > 0 ? '+' : ''}${formatearMonto(resumen.balance, monedaBase)}`}
              </Text>
              {cambioGastos !== null && (
                <Text style={{ color: c.suave, fontSize: 12 }}>
                  {`Gastos ${cambioGastos > 0 ? '+' : ''}${cambioGastos} % frente al mes anterior`}
                </Text>
              )}
            </View>
            {resumen.gastos > 0 && (
              <View style={[styles.kpiAncho, { backgroundColor: c.tarjeta, alignItems: 'center' }]}>
                <Dona
                  segmentos={[
                    ...top.map((x) => ({ id: x.id, nombre: x.nombre, color: x.color, valor: x.total })),
                    ...(resto > 0 ? [{ id: -1, nombre: 'Otras', color: '#6B7280', valor: resto }] : []),
                  ]}
                  titulo="Gastado"
                  valorCentro={formatearMonto(resumen.gastos, monedaBase)}
                  formatear={(v) => formatearMonto(v, monedaBase)}
                  tamano={170}
                  leyenda={false}
                  colorTexto={c.texto}
                />
                <View style={styles.leyenda}>
                  {top.map((x) => (
                    <View key={x.id} style={styles.item}>
                      <View style={[styles.punto, { backgroundColor: x.color }]} />
                      <Text style={[styles.flex, { color: c.texto }]} numberOfLines={1}>
                        {x.nombre}
                      </Text>
                      <Text style={{ color: c.suave }}>{`${Math.round((x.total / resumen.gastos) * 100)} %`}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
        <Text style={[styles.pie, { color: c.suave }]}>{`Montos en ${monedaBase === 'BS' ? 'bolívares' : monedaBase}`}</Text>
      </View>

      <Button mode="contained" icon="share-variant" onPress={compartir} loading={compartiendo} disabled={compartiendo || !resumen}>
        Compartir o guardar imagen
      </Button>
      <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant, textAlign: 'center' }}>
        Se comparte solo esta tarjeta: no incluye nombres de billeteras ni movimientos.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: 16, gap: 14, paddingBottom: 48 },
  tarjeta: { borderRadius: 28, padding: 18, gap: 12 },
  marca: { fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  titulo: { fontSize: 22, fontWeight: '800', textTransform: 'none' },
  fila: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, borderRadius: 20, padding: 14, gap: 4 },
  kpiAncho: { borderRadius: 20, padding: 14, gap: 6 },
  cifra: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  leyenda: { alignSelf: 'stretch', gap: 6, marginTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  punto: { width: 10, height: 10, borderRadius: 5 },
  pie: { fontSize: 11, textAlign: 'center' },
});
