import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Avatar, Button, Card, FAB, IconButton, SegmentedButtons, Text, useTheme } from 'react-native-paper';

import { CintaTasas } from '../../components/CintaTasas';
import { DialogoDictado } from '../../components/DialogoDictado';
import { BarrasPresupuesto } from '../../components/BarrasPresupuesto';
import { GraficoLineas } from '../../components/GraficoLineas';
import { BarrasCategorias, ColumnasMensuales, coloresSeries } from '../../components/graficos';
import { ItemMovimiento } from '../../components/ItemMovimiento';
import { MovimientosRapidos } from '../../components/MovimientosRapidos';
import { ResumenSaldo } from '../../components/ResumenSaldo';
import { TarjetaPendientes } from '../../components/TarjetaPendientes';
import { useTasas } from '../../components/TasasProvider';
import { listarBilleteras, type Billetera } from '../../db/billeteras';
import { listarCategorias, type Categoria } from '../../db/categorias';
import { listarMetas, type Meta } from '../../db/metas';
import { listarPlantillas, type Plantilla } from '../../db/plantillas';
import { estadoPresupuestos, listarPresupuestos, type Presupuesto } from '../../db/presupuestos';
import { procesarRecurrentes, type Recurrente } from '../../db/recurrentes';
import { listarMovimientos, type Movimiento } from '../../db/movimientos';
import {
  Conversor,
  disponibleAl,
  filasDeReporte,
  perdidaPorDevaluacion,
  resumirPeriodo,
  type PuntoPatrimonio,
  totalesPorPeriodo,
  type FilaReporte,
  type HistorialEuro,
} from '../../db/reportes';
import { listarHistorial } from '../../db/tasas';
import { NOMBRE_PAR } from '../../lib/api-tasas';
import { claveDia, nombreMes, rangoMes } from '../../lib/fechas';
import { formatearMonto } from '../../lib/moneda';
import { periodos, type Escala } from '../../lib/periodos';
import { DIAS_AVISO_EXPORTAR, diasSinExportar } from '../../lib/respaldoAuto';
import { actualizarWidget } from '../../widget/manejador';

const MESES_GRAFICO = 6;
/** Cuántas columnas y puntos de línea muestra cada escala. */
const COLUMNAS: Record<Escala, number> = { dia: 7, semana: 6, mes: 6 };
const PUNTOS_LINEA: Record<Escala, number> = { dia: 30, semana: 12, mes: 12 };
const TEXTO_COLUMNAS: Record<Escala, string> = { dia: 'Últimos 7 días', semana: 'Últimas 6 semanas', mes: 'Últimos 6 meses' };
const TEXTO_LINEA: Record<Escala, string> = {
  dia: 'Al cierre de cada día (30 días)',
  semana: 'Al cierre de cada semana (12 semanas)',
  mes: 'Al cierre de cada mes (12 meses)',
};

function claveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface Datos {
  billeteras: Billetera[];
  metas: Meta[];
  recientes: Movimiento[];
  filas: FilaReporte[];
  historial: { dia: string; tasa: number }[];
  historialEuro: HistorialEuro;
  presupuestos: Presupuesto[];
  categorias: Categoria[];
  pendientes: Recurrente[];
  plantillas: Plantilla[];
  devaluacion: { perdida: number; subida: number | null };
  patrimonio: PuntoPatrimonio[];
  /** Días desde la última copia exportada fuera del teléfono (null = nunca). */
  sinExportar: number | null;
}

export default function PantallaInicio() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { cambio, referencia, monedaBase, versionHistorial } = useTasas();
  // Billeteras "guardadas aparte" cuyo saldo se destapó tocándolas.
  const [visibles, setVisibles] = useState<Set<number>>(() => new Set());
  // Primer día del mes que se está viendo.
  const [mes, setMes] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [datos, setDatos] = useState<Datos | null>(null);
  // Escala de los gráficos: por día, por semana o por mes.
  const [escala, setEscala] = useState<Escala>('mes');
  const [dictando, setDictando] = useState(false);
  // Los gráficos terminan hoy si se ve el mes actual; si no, el último día del mes elegido.
  const fin = useMemo(() => {
    const hoy = new Date();
    const finMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    return finMes < hoy ? finMes : hoy;
  }, [mes]);

  const cargar = useCallback(async () => {
    // Se leen los 6 meses del gráfico; el mes elegido es el último.
    // Primero se registran los recurrentes automáticos que tocaban, para que salgan en los reportes.
    const { pendientes } = await procesarRecurrentes(db);
    const desde = rangoMes(mes, -(MESES_GRAFICO - 1)).desde;
    const hasta = rangoMes(mes).hasta;
    const [billeteras, metas, recientes, filas, historial, historialEuroBcv, historialBcv, presupuestos, categorias] =
      await Promise.all([
        listarBilleteras(db),
        listarMetas(db),
        listarMovimientos(db, { limite: 5 }),
        filasDeReporte(db, desde, hasta),
        listarHistorial(db, referencia),
        listarHistorial(db, 'EURO'),
        listarHistorial(db, 'BCV'),
        listarPresupuestos(db),
        listarCategorias(db, 'GASTO', { incluirArchivadas: true }),
      ]);
    const historialEuro = { euro: historialEuroBcv, bcv: historialBcv };
    // Disponible al cierre de cada día (30), semana (12) o mes (12) hasta el periodo que se está viendo.
    const cortes = periodos(escala, fin, PUNTOS_LINEA[escala]);
    const conversor = new Conversor(historial, cambio.dolar, historialEuro, cambio.euro);
    const puntos = await disponibleAl(db, cortes.map((p) => p.hasta), conversor, monedaBase);
    const patrimonio = puntos.map((p, i) => ({ ...p, mes: cortes[i].larga }));
    const [sinExportar, plantillas, devaluacion] = await Promise.all([
      diasSinExportar(db),
      listarPlantillas(db),
      // Lo que perdieron los bolívares en el mes que se está viendo (hasta hoy si es el actual).
      perdidaPorDevaluacion(db, historial, mes, new Date(Math.min(Date.now(), new Date(mes.getFullYear(), mes.getMonth() + 1, 1).getTime()))),
    ]);
    // Mantiene al día el widget de la pantalla de inicio (si el usuario lo agregó).
    actualizarWidget(db).catch(() => {});
    setDatos({
      billeteras,
      metas,
      recientes,
      filas,
      historial,
      historialEuro,
      presupuestos,
      categorias,
      pendientes,
      plantillas,
      devaluacion,
      patrimonio,
      sinExportar,
    });
    // versionHistorial no se usa dentro, pero al cambiar (llegaron tasas nuevas) hay que recargar.
  }, [db, mes, fin, escala, referencia, versionHistorial, monedaBase, cambio.dolar, cambio.euro]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch((e) => Alert.alert('Error', String(e)));
      // Al salir de Inicio, los saldos guardados aparte se vuelven a ocultar.
      return () => setVisibles(new Set());
    }, [cargar]),
  );

  const reporte = useMemo(() => {
    if (!datos) return null;
    const conversor = new Conversor(datos.historial, cambio.dolar, datos.historialEuro, cambio.euro);
    const clave = claveMes(mes);
    const delMes = datos.filas.filter((f) => claveDia(f.fecha).startsWith(clave));
    const columnas = periodos(escala, fin, COLUMNAS[escala]);
    return {
      presupuestos: estadoPresupuestos(datos.presupuestos, datos.categorias, delMes, conversor),
      resumen: resumirPeriodo(delMes, conversor, monedaBase),
      porMes: totalesPorPeriodo(datos.filas, conversor, monedaBase, columnas),
      etiquetas: columnas.map((p) => p.corta),
      titulos: columnas.map((p) => p.larga),
    };
  }, [datos, mes, fin, escala, monedaBase, cambio.dolar, cambio.euro]);

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

  const { resumen, porMes, etiquetas, titulos, presupuestos } = reporte;
  const colores = coloresSeries(tema.dark);
  const esMesActual = claveMes(mes) === claveMes(new Date());
  const cambiarMes = (delta: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1));

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.contenido}>
        <CintaTasas />
        <TarjetaPendientes pendientes={datos.pendientes} onCambio={() => cargar().catch(() => {})} />
        {(datos.sinExportar === null || datos.sinExportar >= DIAS_AVISO_EXPORTAR) && datos.recientes.length > 0 && (
          <Card mode="contained" style={[styles.aviso, { backgroundColor: tema.colors.tertiaryContainer }]} onPress={() => router.push('/ajustes')}>
            <Card.Title
              title={datos.sinExportar === null ? 'Aún no guardas una copia fuera del teléfono' : `Hace ${datos.sinExportar} días que no guardas una copia`}
              subtitle="Toca para exportarla a Drive o WhatsApp"
              subtitleNumberOfLines={2}
              titleNumberOfLines={2}
              left={(p) => <Avatar.Icon {...p} icon="cloud-upload" />}
            />
          </Card>
        )}
        <ResumenSaldo billeteras={datos.billeteras} metas={datos.metas} />

        {/* Billeteras en cuadrícula de dos columnas: se ven todas sin deslizar. */}
        <View style={styles.carrusel}>
          {datos.billeteras.map((b) => {
            const oculta = !b.en_total && !visibles.has(b.id);
            return (
              <Pressable
                key={b.id}
                onPress={() => router.push(`/billetera/${b.id}`)}
                style={[styles.miniTarjeta, { backgroundColor: tema.colors.surfaceVariant }]}
                accessibilityRole="button"
                accessibilityLabel={oculta ? `${b.nombre}, saldo oculto` : `${b.nombre}, ${formatearMonto(b.saldo, b.moneda)}`}
              >
                <View style={styles.filaMini}>
                  <Avatar.Icon size={24} icon={b.icono} color="#FFFFFF" style={{ backgroundColor: b.color_hex }} />
                  <Text variant="labelLarge" numberOfLines={1} style={styles.flex}>
                    {b.nombre}
                  </Text>
                  {!b.en_total && (
                    // El ojo muestra u oculta el saldo; tocar el resto de la tarjeta abre la billetera.
                    <IconButton
                      icon={oculta ? 'eye-outline' : 'eye-off-outline'}
                      size={18}
                      style={styles.ojo}
                      accessibilityLabel={oculta ? 'Ver saldo' : 'Ocultar saldo'}
                      onPress={() =>
                        setVisibles((v) => {
                          const nuevo = new Set(v);
                          if (nuevo.has(b.id)) nuevo.delete(b.id);
                          else nuevo.add(b.id);
                          return nuevo;
                        })
                      }
                    />
                  )}
                </View>
                <Text
                  variant="titleMedium"
                  style={[styles.cifra, b.saldo < 0 && { color: tema.colors.error }]}
                  numberOfLines={1}
                >
                  {oculta ? '••••••' : formatearMonto(b.saldo, b.moneda)}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => router.push('/billetera/nueva')}
            style={[styles.miniTarjeta, styles.nuevaBilletera, { borderColor: tema.colors.outline }]}
            accessibilityRole="button"
            accessibilityLabel="Agregar billetera"
          >
            <View style={styles.filaMini}>
              <Avatar.Icon size={24} icon="plus" />
              <Text variant="labelLarge">Agregar billetera</Text>
            </View>
          </Pressable>
        </View>

        <MovimientosRapidos plantillas={datos.plantillas} onCambio={() => cargar().catch(() => {})} />

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

          {datos.devaluacion.perdida >= 50 && (
            <Card mode="outlined">
              <Card.Title title="Devaluación del mes" left={(p) => <Avatar.Icon {...p} icon="trending-down" />} />
              <Card.Content style={styles.balance}>
                <Text variant="bodyMedium">
                  {`Tus bolívares perdieron ≈ ${formatearMonto(datos.devaluacion.perdida, 'USD')} de valor`}
                  {datos.devaluacion.subida !== null ? ` (la tasa ${NOMBRE_PAR[referencia]} subió ${datos.devaluacion.subida.toFixed(1).replace('.', ',')} %).` : '.'}
                </Text>
                <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                  Lo que tienes en dólares o USDT no pierde valor así: pasar los bolívares que no vas a usar pronto evita esa pérdida.
                </Text>
              </Card.Content>
            </Card>
          )}

          <Card mode="outlined">
            <Card.Title
              title="Presupuestos del mes"
              right={() => <Button onPress={() => router.push('/presupuestos')}>{presupuestos.length ? 'Editar' : 'Crear'}</Button>}
            />
            <Card.Content>
              {presupuestos.length > 0 ? (
                <BarrasPresupuesto estados={presupuestos} />
              ) : (
                <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
                  Pon un límite mensual a tus categorías (comida, transporte…) y te avisaré al acercarte.
                </Text>
              )}
            </Card.Content>
          </Card>

          <Card mode="outlined">
            <Card.Title title="Gastos por categoría" />
            <Card.Content>
              <BarrasCategorias categorias={resumen.gastosPorCategoria} moneda={monedaBase} />
            </Card.Content>
          </Card>

          <SegmentedButtons
            value={escala}
            onValueChange={(v) => setEscala(v as Escala)}
            buttons={[
              { value: 'dia', label: 'Día' },
              { value: 'semana', label: 'Semana' },
              { value: 'mes', label: 'Mes' },
            ]}
          />

          <Card mode="outlined">
            <Card.Title
              title="Ingresos vs. gastos"
              subtitle={`${TEXTO_COLUMNAS[escala]} · toca una columna para ver sus cifras`}
              subtitleNumberOfLines={2}
            />
            <Card.Content>
              <ColumnasMensuales
                key={escala + claveMes(mes) + monedaBase}
                meses={porMes}
                etiquetas={etiquetas}
                titulos={titulos}
                moneda={monedaBase}
              />
            </Card.Content>
          </Card>

          <Card mode="outlined">
            <Card.Title
              title="Evolución de lo disponible"
              subtitle={`${TEXTO_LINEA[escala]}, sin metas ni billeteras aparte`}
              subtitleNumberOfLines={2}
            />
            <Card.Content>
              <GraficoLineas
                key={escala}
                etiquetas={datos.patrimonio.map((p) => p.mes)}
                series={[{ nombre: 'Disponible', color: colores.ingresos, valores: datos.patrimonio.map((p) => (p.incompleto ? null : p.total)) }]}
                formatear={(v) => formatearMonto(Math.round(v), monedaBase)}
              />
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
      <FAB icon="microphone" size="small" accessibilityLabel="Dictar un movimiento" style={styles.fabVoz} onPress={() => setDictando(true)} />
      <FAB icon="plus" label="Movimiento" style={styles.fab} onPress={() => router.push('/movimiento/nuevo')} />
      <DialogoDictado visible={dictando} onCerrar={() => setDictando(false)} />
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
  carrusel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  miniTarjeta: { flexGrow: 1, flexBasis: '45%', borderRadius: 12, padding: 12, gap: 6 },
  filaMini: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ojo: { margin: -8 },
  nuevaBilletera: { borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center' },
  cifra: { fontVariant: ['tabular-nums'] },
  negrita: { fontWeight: '700' },
  seccion: { paddingHorizontal: 16, gap: 12 },
  aviso: { marginHorizontal: 16 },
  selectorMes: { flexDirection: 'row', alignItems: 'center' },
  mes: { flex: 1, textAlign: 'center', textTransform: 'capitalize' },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { gap: 4 },
  muestra: { width: 10, height: 10, borderRadius: 2 },
  balance: { gap: 2 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
  fabVoz: { position: 'absolute', right: 20, bottom: 88 },
});
