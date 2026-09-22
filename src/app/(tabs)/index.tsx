import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Avatar, Button, Card, FAB, IconButton, Text, useTheme } from 'react-native-paper';

import { CintaTasas } from '../../components/CintaTasas';
import { BarrasCategorias, ColumnasMensuales, coloresSeries } from '../../components/graficos';
import { ItemMovimiento } from '../../components/ItemMovimiento';
import { ResumenSaldo } from '../../components/ResumenSaldo';
import { useTasas } from '../../components/TasasProvider';
import { listarBilleteras, type Billetera } from '../../db/billeteras';
import { listarMetas, type Meta } from '../../db/metas';
import { listarMovimientos, type Movimiento } from '../../db/movimientos';
import {
  Conversor,
  filasDeReporte,
  resumirPeriodo,
  totalesPorMes,
  type FilaReporte,
} from '../../db/reportes';
import { listarHistorial } from '../../db/tasas';
import { NOMBRE_PAR } from '../../lib/api-tasas';
import { claveDia, nombreMes, rangoMes } from '../../lib/fechas';
import { formatearMonto } from '../../lib/moneda';

const MESES_GRAFICO = 6;
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function claveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface Datos {
  billeteras: Billetera[];
  metas: Meta[];
  recientes: Movimiento[];
  filas: FilaReporte[];
  historial: { dia: string; tasa: number }[];
}

export default function PantallaInicio() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { tasas, referencia, monedaBase, versionHistorial } = useTasas();
  // Primer día del mes que se está viendo.
  const [mes, setMes] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [datos, setDatos] = useState<Datos | null>(null);

  const cargar = useCallback(async () => {
    // Se leen los 6 meses del gráfico; el mes elegido es el último.
    const desde = rangoMes(mes, -(MESES_GRAFICO - 1)).desde;
    const hasta = rangoMes(mes).hasta;
    const [billeteras, metas, recientes, filas, historial] = await Promise.all([
      listarBilleteras(db),
      listarMetas(db),
      listarMovimientos(db, { limite: 5 }),
      filasDeReporte(db, desde, hasta),
      listarHistorial(db, referencia),
    ]);
    setDatos({ billeteras, metas, recientes, filas, historial });
    // versionHistorial no se usa dentro, pero al cambiar (llegaron tasas nuevas) hay que recargar.
  }, [db, mes, referencia, versionHistorial]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch((e) => Alert.alert('Error', String(e)));
    }, [cargar]),
  );

  const reporte = useMemo(() => {
    if (!datos) return null;
    const conversor = new Conversor(datos.historial, tasas[referencia]?.tasa ?? null);
    const clave = claveMes(mes);
    const delMes = datos.filas.filter((f) => claveDia(f.fecha).startsWith(clave));
    const meses = Array.from({ length: MESES_GRAFICO }, (_, i) => new Date(mes.getFullYear(), mes.getMonth() - (MESES_GRAFICO - 1) + i, 1));
    return {
      resumen: resumirPeriodo(delMes, conversor, monedaBase),
      porMes: totalesPorMes(datos.filas, conversor, monedaBase, meses.map(claveMes)),
      etiquetas: meses.map((d) => MESES_CORTOS[d.getMonth()]),
    };
  }, [datos, mes, monedaBase, referencia, tasas]);

  if (!datos || !reporte) return <ActivityIndicator style={styles.cargando} />;

  if (datos.billeteras.length === 0) {
    return (
      <View style={styles.bienvenida}>
        <CintaTasas />
        <Text variant="headlineSmall" style={styles.centrado}>
          ¡Bienvenido!
        </Text>
        <Text variant="bodyMedium" style={[styles.centrado, { color: tema.colors.onSurfaceVariant }]}>
          Empieza creando tus billeteras: dónde tienes tu dinero y en qué moneda.
        </Text>
        <Button mode="contained" icon="wallet-plus" onPress={() => router.navigate('/billeteras')}>
          Ir a Billeteras
        </Button>
      </View>
    );
  }

  const { resumen, porMes, etiquetas } = reporte;
  const colores = coloresSeries(tema.dark);
  const esMesActual = claveMes(mes) === claveMes(new Date());
  const cambiarMes = (delta: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1));

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.contenido}>
        <CintaTasas />
        <ResumenSaldo billeteras={datos.billeteras} metas={datos.metas} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carrusel}>
          {datos.billeteras.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => router.push(`/billetera/${b.id}`)}
              style={[styles.miniTarjeta, { backgroundColor: tema.colors.surfaceVariant }]}
              accessibilityRole="button"
              accessibilityLabel={`${b.nombre}, ${formatearMonto(b.saldo, b.moneda)}`}
            >
              <View style={styles.filaMini}>
                <Avatar.Icon size={24} icon={b.icono} color="#FFFFFF" style={{ backgroundColor: b.color_hex }} />
                <Text variant="labelLarge" numberOfLines={1} style={styles.flex}>
                  {b.nombre}
                </Text>
              </View>
              <Text
                variant="titleMedium"
                style={[styles.cifra, b.saldo < 0 && { color: tema.colors.error }]}
                numberOfLines={1}
              >
                {formatearMonto(b.saldo, b.moneda)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.seccion}>
          <View style={styles.selectorMes}>
            <IconButton icon="chevron-left" onPress={() => cambiarMes(-1)} accessibilityLabel="Mes anterior" />
            <Text variant="titleMedium" style={styles.mes}>
              {nombreMes(mes)}
            </Text>
            <IconButton
              icon="chevron-right"
              onPress={() => cambiarMes(1)}
              disabled={esMesActual}
              accessibilityLabel="Mes siguiente"
            />
          </View>

          <View style={styles.kpis}>
            <Kpi titulo="Ingresos" valor={formatearMonto(resumen.ingresos, monedaBase)} marca={colores.ingresos} />
            <Kpi titulo="Gastos" valor={formatearMonto(resumen.gastos, monedaBase)} marca={colores.gastos} />
          </View>
          <Card mode="contained">
            <Card.Content style={styles.balance}>
              <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
                Balance neto del mes
              </Text>
              <Text
                variant="headlineSmall"
                style={[styles.cifra, styles.negrita, resumen.balance < 0 && { color: tema.colors.error }]}
              >
                {`${resumen.balance > 0 ? '+' : ''}${formatearMonto(resumen.balance, monedaBase)}`}
              </Text>
            </Card.Content>
          </Card>
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            {`Montos en ${monedaBase === 'BS' ? 'bolívares' : 'dólares'}, cada movimiento convertido con la tasa ${NOMBRE_PAR[referencia]} de su día. No incluye transferencias ni metas.`}
            {resumen.incompleto ? ' Faltan tasas para convertir algunos movimientos en Bs.' : ''}
          </Text>

          <Card mode="outlined">
            <Card.Title title="Gastos por categoría" />
            <Card.Content>
              <BarrasCategorias categorias={resumen.gastosPorCategoria} moneda={monedaBase} />
            </Card.Content>
          </Card>

          <Card mode="outlined">
            <Card.Title title="Ingresos vs. gastos" subtitle="Últimos 6 meses · toca un mes para ver sus cifras" />
            <Card.Content>
              <ColumnasMensuales key={claveMes(mes) + monedaBase} meses={porMes} etiquetas={etiquetas} moneda={monedaBase} />
            </Card.Content>
          </Card>

          <Card mode="outlined">
            <Card.Title title="Movimientos recientes" />
            {datos.recientes.length === 0 ? (
              <Card.Content>
                <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
                  Aún no has registrado movimientos.
                </Text>
              </Card.Content>
            ) : (
              datos.recientes.map((m) => (
                <ItemMovimiento key={m.id} movimiento={m} onPress={() => router.push(`/movimiento/${m.id}`)} />
              ))
            )}
            <Card.Actions>
              <Button onPress={() => router.navigate('/movimientos')}>Ver todos</Button>
            </Card.Actions>
          </Card>
        </View>
      </ScrollView>
      <FAB icon="plus" label="Movimiento" style={styles.fab} onPress={() => router.push('/movimiento/nuevo')} />
    </View>
  );
}

function Kpi({ titulo, valor, marca }: { titulo: string; valor: string; marca: string }) {
  const tema = useTheme();
  return (
    <Card mode="contained" style={styles.flex}>
      <Card.Content style={styles.kpi}>
        <View style={styles.filaMini}>
          <View style={[styles.muestra, { backgroundColor: marca }]} />
          <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
            {titulo}
          </Text>
        </View>
        <Text variant="titleMedium" style={[styles.cifra, styles.negrita]} numberOfLines={1} adjustsFontSizeToFit>
          {valor}
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cargando: { marginTop: 48 },
  contenido: { paddingVertical: 8, paddingHorizontal: 0, gap: 12, paddingBottom: 96 },
  bienvenida: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  centrado: { textAlign: 'center' },
  carrusel: { gap: 8, paddingHorizontal: 16 },
  miniTarjeta: { width: 160, borderRadius: 12, padding: 12, gap: 6 },
  filaMini: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cifra: { fontVariant: ['tabular-nums'] },
  negrita: { fontWeight: '700' },
  seccion: { paddingHorizontal: 16, gap: 12 },
  selectorMes: { flexDirection: 'row', alignItems: 'center' },
  mes: { flex: 1, textAlign: 'center', textTransform: 'capitalize' },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { gap: 4 },
  muestra: { width: 10, height: 10, borderRadius: 2 },
  balance: { gap: 2 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
