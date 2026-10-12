import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Fragment, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Avatar, Button, Card, FAB, IconButton, SegmentedButtons, Text, useTheme } from 'react-native-paper';

import { AccesosRapidos } from '../../components/AccesosRapidos';
import { AvisosDetectados } from '../../components/AvisosDetectados';
import { BarraAnimada } from '../../components/BarraAnimada';
import { BotonFlotante } from '../../components/BotonFlotante';
import { CintaTasas } from '../../components/CintaTasas';
import { DeslizarMes } from '../../components/DeslizarMes';
import { DialogoDictado } from '../../components/DialogoDictado';
import { Dona } from '../../components/Dona';
import { CLAVE_GUIA, GuiaBienvenida } from '../../components/GuiaBienvenida';
import { BarrasPresupuesto } from '../../components/BarrasPresupuesto';
import { GastosDeCategoria } from '../../components/GastosDeCategoria';
import { GraficoLineas } from '../../components/GraficoLineas';
import { IconoCuadro } from '../../components/IconoCuadro';
import { BarrasCategorias, ColumnasMensuales, coloresSeries } from '../../components/graficos';
import { ItemMovimiento } from '../../components/ItemMovimiento';
import { MovimientosRapidos } from '../../components/MovimientosRapidos';
import { ResumenSaldo } from '../../components/ResumenSaldo';
import { SelectorMes } from '../../components/SelectorMes';
import { TarjetasFlujo } from '../../components/TarjetasFlujo';
import { TarjetaPendientes } from '../../components/TarjetaPendientes';
import { useTasas } from '../../components/TasasProvider';
import { listarBilleteras, type Billetera } from '../../db/billeteras';
import { listarCategorias, type Categoria } from '../../db/categorias';
import { ajenoPorBilletera, listarDeudas, type Deuda } from '../../db/deudas';
import { listarMetas, type Meta } from '../../db/metas';
import { listarPlantillas, type Plantilla } from '../../db/plantillas';
import { guardarPreferencia, leerPreferencia } from '../../db/preferencias';
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
import { claveDia, rangoMes } from '../../lib/fechas';
import { formatearMonto } from '../../lib/moneda';
import { fijosVariables, gastosHormiga, pronosticoMes } from '../../lib/analisis';
import { convertir, totalConsolidado } from '../../lib/conversion';
import { periodos, type Escala } from '../../lib/periodos';
import { CLAVE_SECCIONES, leerSecciones, SECCIONES_INICIO, type ClaveSeccion, type Seccion } from '../../lib/seccionesInicio';
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
  /** Deudas abiertas: de aquí sale el dinero de otros guardado en cada billetera. */
  deudas: Deuda[];
  metas: Meta[];
  recientes: Movimiento[];
  filas: FilaReporte[];
  historial: { dia: string; tasa: number }[];
  historialEuro: HistorialEuro;
  historialUsdt: { dia: string; tasa: number }[];
  presupuestos: Presupuesto[];
  categorias: Categoria[];
  pendientes: Recurrente[];
  plantillas: Plantilla[];
  devaluacion: { perdida: number; subida: number | null };
  patrimonio: PuntoPatrimonio[];
  /** Días desde la última copia exportada fuera del teléfono (null = nunca). */
  sinExportar: number | null;
  /** Disponible al cierre del mes pasado (para "vs mes pasado"). */
  anterior: number | null;
}

export default function PantallaInicio() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { cambio, referencia, monedaBase, versionHistorial, actualizar } = useTasas();
  const [refrescando, setRefrescando] = useState(false);
  // Jalar hacia abajo: tasas nuevas (si hay internet) y todo recalculado.
  const refrescar = async () => {
    setRefrescando(true);
    try {
      await actualizar(true);
      await cargar();
    } catch {
      // Sin internet se queda con lo que hay.
    } finally {
      setRefrescando(false);
    }
  };
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
  // La guía de bienvenida sale la primera vez (o cuando se pide desde Ajustes).
  const [guia, setGuia] = useState(false);
  // Orden y visibilidad de las secciones (Personalizar Inicio).
  const [secciones, setSecciones] = useState<Seccion[]>(SECCIONES_INICIO);
  const terminarGuia = () => {
    setGuia(false);
    guardarPreferencia(db, CLAVE_GUIA, '1').catch(() => {});
  };
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
    const [billeteras, metas, recientes, filas, historial, historialEuroBcv, historialBcv, presupuestos, categorias, historialUsdt] =
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
        listarHistorial(db, 'PARALELO'),
      ]);
    const historialEuro = { euro: historialEuroBcv, bcv: historialBcv };
    // Disponible al cierre de cada día (30), semana (12) o mes (12) hasta el periodo que se está viendo.
    const cortes = periodos(escala, fin, PUNTOS_LINEA[escala]);
    const conversor = new Conversor(historial, cambio.dolar, historialEuro, cambio.euro, historialUsdt);
    const puntos = await disponibleAl(db, cortes.map((p) => p.hasta), conversor, monedaBase);
    const patrimonio = puntos.map((p, i) => ({ ...p, mes: cortes[i].larga }));
    const hoy = new Date();
    const [cierre] = await disponibleAl(db, [new Date(hoy.getFullYear(), hoy.getMonth(), 1)], conversor, monedaBase);
    const [sinExportar, plantillas, devaluacion, deudas] = await Promise.all([
      diasSinExportar(db),
      listarPlantillas(db),
      // Lo que perdieron los bolívares en el mes que se está viendo (hasta hoy si es el actual).
      perdidaPorDevaluacion(db, historial, mes, new Date(Math.min(Date.now(), new Date(mes.getFullYear(), mes.getMonth() + 1, 1).getTime()))),
      listarDeudas(db, { incluirCerradas: false }),
    ]);
    // Mantiene al día el widget de la pantalla de inicio (si el usuario lo agregó).
    actualizarWidget(db).catch(() => {});
    setDatos({
      billeteras,
      deudas,
      metas,
      recientes,
      filas,
      historial,
      historialEuro,
      historialUsdt,
      presupuestos,
      categorias,
      pendientes,
      plantillas,
      devaluacion,
      patrimonio,
      sinExportar,
      anterior: cierre && !cierre.incompleto ? cierre.total : null,
    });
    // versionHistorial no se usa dentro, pero al cambiar (llegaron tasas nuevas) hay que recargar.
  }, [db, mes, fin, escala, referencia, versionHistorial, monedaBase, cambio.dolar, cambio.euro]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch((e) => Alert.alert('Error', String(e)));
      leerPreferencia(db, CLAVE_GUIA)
        .then((v) => setGuia(v === null))
        .catch(() => {});
      leerPreferencia(db, CLAVE_SECCIONES)
        .then((v) => setSecciones(leerSecciones(v)))
        .catch(() => {});
      // Al salir de Inicio, los saldos guardados aparte se vuelven a ocultar.
      return () => setVisibles(new Set());
    }, [cargar, db]),
  );

  const reporte = useMemo(() => {
    if (!datos) return null;
    const conversor = new Conversor(datos.historial, cambio.dolar, datos.historialEuro, cambio.euro, datos.historialUsdt);
    const clave = claveMes(mes);
    const delMes = datos.filas.filter((f) => claveDia(f.fecha).startsWith(clave));
    const claveAnterior = claveMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1));
    const delAnterior = datos.filas.filter((f) => claveDia(f.fecha).startsWith(claveAnterior));
    const anteriores = new Map(resumirPeriodo(delAnterior, conversor, monedaBase).gastosPorCategoria.map((c) => [c.id, c.total]));
    const columnas = periodos(escala, fin, COLUMNAS[escala]);
    // Gasto hormiga: hasta el equivalente de $3 en la moneda que se está viendo.
    const umbral = convertir(300, 'USD', monedaBase, cambio) ?? 300;
    return {
      anteriores,
      hormiga: gastosHormiga(delMes, conversor, monedaBase, umbral),
      umbralHormiga: umbral,
      fijos: fijosVariables(delMes, conversor, monedaBase),
      presupuestos: estadoPresupuestos(datos.presupuestos, datos.categorias, delMes, conversor),
      resumen: resumirPeriodo(delMes, conversor, monedaBase),
      porMes: totalesPorPeriodo(datos.filas, conversor, monedaBase, columnas),
      etiquetas: columnas.map((p) => p.corta),
      titulos: columnas.map((p) => p.larga),
    };
  }, [datos, mes, fin, escala, monedaBase, cambio]);

  if (!datos || !reporte) return <ActivityIndicator style={styles.cargando} />;

  const ajenoPor = ajenoPorBilletera(datos.deudas);

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
        <GuiaBienvenida visible={guia} onTerminar={terminarGuia} />
      </View>
    );
  }

  const { resumen, porMes, etiquetas, titulos, presupuestos, anteriores, hormiga, umbralHormiga, fijos } = reporte;
  // Disponible de hoy (como en el balance): billeteras que cuentan, sin el dinero de otros.
  const disponibleHoy = totalConsolidado(
    datos.billeteras.filter((b) => !b.archivada && b.en_total).map((b) => ({ moneda: b.moneda, saldo: b.saldo - (ajenoPor.get(b.id) ?? 0) })),
    monedaBase,
    cambio,
  );
  const esMesActual = claveMes(mes) === claveMes(new Date());
  const pronostico = esMesActual && disponibleHoy !== null ? pronosticoMes(resumen.gastos, disponibleHoy) : null;
  const totalFijosVariables = fijos.fijos + fijos.variables;
  const colores = coloresSeries(tema.dark);

  // Cada sección de Inicio; se muestran en el orden y con la visibilidad que eligió el usuario.
  const bloques: Record<ClaveSeccion, ReactNode> = {
    accesos: (
          <AccesosRapidos
            accesos={[
              { icono: 'arrow-up', texto: 'Gasto', onPress: () => router.push({ pathname: '/movimiento/nuevo', params: { tipo: 'GASTO' } }) },
              { icono: 'arrow-down', texto: 'Ingreso', onPress: () => router.push({ pathname: '/movimiento/nuevo', params: { tipo: 'INGRESO' } }) },
              { icono: 'swap-horizontal', texto: 'Transferir', onPress: () => router.push({ pathname: '/movimiento/nuevo', params: { tipo: 'TRANSFERENCIA' } }) },
              { icono: 'microphone', texto: 'Dictar', onPress: () => setDictando(true) },
            ]}
          />
    ),
    billeteras: (
      <>
        {/* Billeteras en cuadrícula de dos columnas: se ven todas sin deslizar. */}
        <View style={styles.carrusel}>
          {datos.billeteras.map((b) => {
            const oculta = !b.en_total && !visibles.has(b.id);
            const deOtros = ajenoPor.get(b.id);
            return (
              <Pressable
                key={b.id}
                onPress={() => router.push(`/billetera/${b.id}`)}
                style={[styles.miniTarjeta, { backgroundColor: tema.colors.surfaceVariant }]}
                accessibilityRole="button"
                accessibilityLabel={oculta ? `${b.nombre}, saldo oculto` : `${b.nombre}, ${formatearMonto(b.saldo, b.moneda)}`}
              >
                <View style={styles.filaMini}>
                  <IconoCuadro icono={b.icono} color={b.color_hex} tamano={32} />
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
                {deOtros && !oculta ? (
                  <Text variant="bodySmall" numberOfLines={1} style={{ color: tema.colors.onSurfaceVariant }}>
                    {`de otros: ${formatearMonto(deOtros, b.moneda)}`}
                  </Text>
                ) : null}
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
              <IconoCuadro icono="plus" color={tema.colors.primary} tamano={32} />
              <Text variant="labelLarge">Agregar billetera</Text>
            </View>
          </Pressable>
        </View>
      </>
    ),
    rapidos: (
          <MovimientosRapidos plantillas={datos.plantillas} onCambio={() => cargar().catch(() => {})} />
    ),
    mes: (
      <View style={styles.seccion}>
          <DeslizarMes mes={mes} onCambio={setMes}>
            <View style={styles.flujo}>
              <SelectorMes mes={mes} onCambio={setMes} />
              <TarjetasFlujo ingresos={resumen.ingresos} gastos={resumen.gastos} moneda={monedaBase} />
            </View>
          </DeslizarMes>
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            {`Montos en ${NOMBRE_MONEDA_BASE[monedaBase]}, cada movimiento convertido con la tasa ${NOMBRE_PAR[referencia]} de su día. No incluye transferencias ni metas.`}
            {resumen.incompleto ? ' Faltan tasas para convertir algunos movimientos en Bs.' : ''}
          </Text>

          {datos.devaluacion.perdida >= 50 && (
            <Card mode="contained">
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
      </View>
    ),
    pronostico: pronostico ? (
      <View style={styles.seccion}>
        <Card mode="contained">
          <Card.Title title="Pronóstico del mes" left={(p) => <Avatar.Icon {...p} icon="crystal-ball" />} />
          <Card.Content style={styles.balance}>
            <Text variant="bodyMedium">
              {`Llevas ${formatearMonto(resumen.gastos, monedaBase)} gastado en ${pronostico.diasTranscurridos} días (≈ ${formatearMonto(pronostico.porDia, monedaBase)} por día).`}
            </Text>
            <Text variant="titleMedium" style={[styles.cifra, styles.negrita, pronostico.finDeMes < 0 && { color: tema.colors.error }]}>
              {pronostico.finDeMes >= 0
                ? `A este ritmo terminas el mes con ≈ ${formatearMonto(pronostico.finDeMes, monedaBase)}`
                : `A este ritmo te faltarían ≈ ${formatearMonto(-pronostico.finDeMes, monedaBase)}`}
            </Text>
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              {`Para llegar a fin de mes: máximo ${formatearMonto(pronostico.maximoPorDia, monedaBase)} por día en los ${pronostico.diasRestantes + 1} días que quedan. No cuenta ingresos futuros.`}
            </Text>
          </Card.Content>
        </Card>
      </View>
    ) : null,
    analisis:
      totalFijosVariables > 0 || hormiga.cantidad > 0 ? (
        <View style={styles.seccion}>
          <Card mode="contained">
            <Card.Title title="¿En qué se va?" left={(p) => <Avatar.Icon {...p} icon="magnify-scan" />} />
            <Card.Content style={styles.categorias}>
              {totalFijosVariables > 0 && (
                <View style={styles.balance}>
                  <View style={styles.filaFijos}>
                    <Text variant="bodyMedium">{`Fijos ${formatearMonto(fijos.fijos, monedaBase)}`}</Text>
                    <Text variant="bodyMedium">{`Variables ${formatearMonto(fijos.variables, monedaBase)}`}</Text>
                  </View>
                  <View style={[styles.barraFijos, { backgroundColor: '#F59E0B' }]}>
                    <BarraAnimada porcentaje={(fijos.fijos / totalFijosVariables) * 100} style={[styles.rellenoFijos, { backgroundColor: '#3B82F6' }]} />
                  </View>
                  <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                    Azul: lo que pagas sí o sí (alquiler, servicios…). Naranja: lo que puedes recortar. Marca una categoría como fija al editarla.
                  </Text>
                </View>
              )}
              {hormiga.cantidad >= 3 && (
                <View style={styles.balance}>
                  <Text variant="titleSmall">{`🐜 Gastos hormiga: ${formatearMonto(hormiga.total, monedaBase)}`}</Text>
                  <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                    {`${hormiga.cantidad} gastos pequeños (de hasta ${formatearMonto(umbralHormiga, monedaBase)}) este mes. Más en: ${hormiga.categorias
                      .slice(0, 3)
                      .map((c) => `${c.nombre} (${c.cantidad})`)
                      .join(', ')}.`}
                  </Text>
                </View>
              )}
              <Button mode="text" icon="pound" style={styles.izquierda} onPress={() => router.push('/etiquetas')}>
                Ver por etiquetas (#viaje, #moto…)
              </Button>
            </Card.Content>
          </Card>
        </View>
      ) : null,
    presupuestos: (
      <View style={styles.seccion}>
          <Card mode="contained">
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
      </View>
    ),
    categorias: (
      <View style={styles.seccion}>
          <Card mode="contained">
            <Card.Title title="Gastos por categoría" subtitle="Toca una para ver sus gastos · % vs. el mes pasado" />
            <Card.Content style={styles.categorias}>
              {resumen.gastos > 0 && (
                <Dona
                  segmentos={(() => {
                    const lista = resumen.gastosPorCategoria;
                    const resto = lista.slice(6).reduce((suma, c) => suma + c.total, 0);
                    return [
                      ...lista.slice(0, 6).map((c) => ({ id: c.id, nombre: c.nombre, color: c.color, valor: c.total })),
                      ...(resto > 0 ? [{ id: -1, nombre: 'Otras', color: '#6B7280', valor: resto }] : []),
                    ];
                  })()}
                  titulo="Gastado"
                  valorCentro={formatearMonto(resumen.gastos, monedaBase)}
                  formatear={(v) => formatearMonto(v, monedaBase)}
                  leyenda={false}
                />
              )}
              <BarrasCategorias
                categorias={resumen.gastosPorCategoria}
                moneda={monedaBase}
                anteriores={anteriores}
                detalle={(id) => <GastosDeCategoria categoriaId={id} {...rangoMes(mes)} />}
              />
            </Card.Content>
          </Card>
      </View>
    ),
    columnas: (
      <View style={styles.seccion}>
          <SegmentedButtons
            value={escala}
            onValueChange={(v) => setEscala(v as Escala)}
            buttons={[
              { value: 'dia', label: 'Día' },
              { value: 'semana', label: 'Semana' },
              { value: 'mes', label: 'Mes' },
            ]}
          />

          <Card mode="contained">
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
      </View>
    ),
    evolucion: (
      <View style={styles.seccion}>
          <Card mode="contained">
            <Card.Title
              title="Evolución de lo disponible"
              subtitle={`${TEXTO_LINEA[escala]}, sin metas, billeteras aparte ni dinero de otros`}
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
      </View>
    ),
    recientes: (
      <View style={styles.seccion}>
          <Card mode="contained">
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
    ),
  };


  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.contenido}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={refrescar}
            colors={[tema.colors.onPrimaryContainer]}
            progressBackgroundColor={tema.colors.primaryContainer}
          />
        }
      >
        <CintaTasas />
        <TarjetaPendientes pendientes={datos.pendientes} onCambio={() => cargar().catch(() => {})} />
        <AvisosDetectados billeteras={datos.billeteras} />
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
        <ResumenSaldo billeteras={datos.billeteras} metas={datos.metas} deudas={datos.deudas} anterior={datos.anterior} />

        {secciones
          .filter((x) => x.visible)
          .map((x) => (
            <Fragment key={x.clave}>{bloques[x.clave]}</Fragment>
          ))}
        <Button mode="text" icon="view-dashboard-edit-outline" onPress={() => router.push('/inicio-personalizar')}>
          Personalizar Inicio
        </Button>
      </ScrollView>
      <BotonFlotante onDictar={() => setDictando(true)} />
      <DialogoDictado visible={dictando} onCerrar={() => setDictando(false)} />
      <GuiaBienvenida visible={guia} onTerminar={terminarGuia} />
    </View>
  );
}

const NOMBRE_MONEDA_BASE: Record<string, string> = {
  BS: 'bolívares',
  USD: 'dólares',
  USDT: 'USDT',
  EUR: 'euros',
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cargando: { marginTop: 48 },
  contenido: { paddingVertical: 8, paddingHorizontal: 0, gap: 12, paddingBottom: 96 },
  bienvenida: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  centrado: { textAlign: 'center' },
  carrusel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  miniTarjeta: { flexGrow: 1, flexBasis: '45%', borderRadius: 22, padding: 14, gap: 8 },
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
  categorias: { gap: 16 },
  flujo: { gap: 12 },
  filaFijos: { flexDirection: 'row', justifyContent: 'space-between' },
  barraFijos: { height: 12, borderRadius: 6, overflow: 'hidden' },
  rellenoFijos: { height: 12 },
  izquierda: { alignSelf: 'flex-start' },
  fab: { position: 'absolute', right: 16, bottom: 16, borderRadius: 999 },
});
