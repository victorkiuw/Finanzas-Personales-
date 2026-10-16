import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Alert, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Snackbar, Text, useTheme } from 'react-native-paper';

import { ErrorValidacion } from '../db/billeteras';
import {
  duplicarMovimiento,
  eliminarMovimiento,
  listarMovimientos,
  type FiltroMovimientos,
  type Movimiento,
} from '../db/movimientos';
import { claveDia, formatearDia } from '../lib/fechas';
import { formatearMonto, type Moneda } from '../lib/moneda';
import { useListo } from './ConfirmacionListo';
import { FilaDeslizable } from './FilaDeslizable';
import { COLOR_GASTO, COLOR_GASTO_OSCURO, COLOR_INGRESO, COLOR_INGRESO_OSCURO, ItemMovimiento } from './ItemMovimiento';

const TAMANO_PAGINA = 40;
/** Segundos para deshacer un borrado antes de que se haga de verdad. */
const ESPERA_BORRADO = 4000;

/** Se puede repetir: gastos, ingresos y transferencias normales (no metas, deudas, cuotas ni comisiones). */
function duplicable(m: Movimiento): boolean {
  return ['GASTO', 'INGRESO', 'TRANSFERENCIA'].includes(m.tipo) && m.meta_id === null && m.deuda_id === null && m.compra_id === null && m.comision_de === null;
}

interface Props {
  filtro: Omit<FiltroMovimientos, 'limite' | 'desplazamiento'>;
  /** Se muestra encima de la lista y se desplaza con ella. */
  encabezado?: ReactElement;
  textoVacio?: string;
  /** Ingresos y gastos de cada día (en `monedaTotales`) para mostrarlos junto a la fecha. */
  totalesDia?: Map<string, { ingresos: number; gastos: number }>;
  monedaTotales?: Moneda;
  /** Al jalar hacia abajo, además de recargar la lista. */
  onRefrescar?: () => Promise<void> | void;
}

/** Lista paginada (scroll infinito) y agrupada por día; se recarga al volver a la pantalla. */
export function ListaMovimientos({ filtro, encabezado, textoVacio = 'No hay movimientos.', totalesDia, monedaTotales, onRefrescar }: Props) {
  const [refrescando, setRefrescando] = useState(false);
  const db = useSQLiteContext();
  const mostrarListo = useListo();
  // Borrado con "Deshacer": se oculta enseguida y se borra de verdad a los pocos segundos.
  const [ocultos, setOcultos] = useState<Set<number>>(() => new Set());
  const [aviso, setAviso] = useState<string | null>(null);
  const pendiente = useRef<{ id: number; temporizador: ReturnType<typeof setTimeout> } | null>(null);
  const tema = useTheme();
  const [items, setItems] = useState<Movimiento[] | null>(null);
  const [hayMas, setHayMas] = useState(true);
  const cargandoMas = useRef(false);
  const visibles = useRef(0);
  visibles.current = items?.length ?? 0;
  // El filtro llega como objeto nuevo en cada render; se compara por contenido.
  const clave = JSON.stringify(filtro);

  const recargar = useCallback(async () => {
    // Al volver de editar se recargan al menos los que ya estaban visibles.
    const limite = Math.max(TAMANO_PAGINA, visibles.current);
    const nuevos = await listarMovimientos(db, { ...(JSON.parse(clave) as Props['filtro']), limite });
    setItems(nuevos);
    setHayMas(nuevos.length === limite);
  }, [db, clave]);

  useFocusEffect(
    useCallback(() => {
      recargar().catch((e) => Alert.alert('Error', String(e)));
    }, [recargar]),
  );

  const confirmarBorrado = useCallback(async () => {
    const p = pendiente.current;
    if (!p) return;
    clearTimeout(p.temporizador);
    pendiente.current = null;
    try {
      await eliminarMovimiento(db, p.id);
    } catch (e) {
      Alert.alert('No se pudo eliminar', e instanceof ErrorValidacion ? e.message : String(e));
    }
    setOcultos((o) => {
      const n = new Set(o);
      n.delete(p.id);
      return n;
    });
    await recargar().catch(() => {});
  }, [db, recargar]);

  // Si se sale de la pantalla con un borrado pendiente, se hace en ese momento.
  useEffect(
    () => () => {
      const p = pendiente.current;
      if (p) {
        clearTimeout(p.temporizador);
        eliminarMovimiento(db, p.id).catch(() => {});
      }
    },
    [db],
  );

  const eliminar = (m: Movimiento) => {
    if (pendiente.current) confirmarBorrado().catch(() => {});
    setOcultos((o) => new Set(o).add(m.id));
    setAviso('Movimiento eliminado');
    pendiente.current = { id: m.id, temporizador: setTimeout(() => confirmarBorrado().catch(() => {}), ESPERA_BORRADO) };
  };

  const deshacer = () => {
    const p = pendiente.current;
    if (!p) return;
    clearTimeout(p.temporizador);
    pendiente.current = null;
    setOcultos((o) => {
      const n = new Set(o);
      n.delete(p.id);
      return n;
    });
    setAviso(null);
  };

  const duplicar = async (m: Movimiento) => {
    try {
      await duplicarMovimiento(db, m.id);
      mostrarListo('Repetido con fecha de hoy');
      await recargar();
    } catch (e) {
      Alert.alert('No se pudo duplicar', e instanceof ErrorValidacion ? e.message : String(e));
    }
  };

  const cargarMas = async () => {
    if (!items || !hayMas || cargandoMas.current) return;
    cargandoMas.current = true;
    try {
      const mas = await listarMovimientos(db, {
        ...filtro,
        limite: TAMANO_PAGINA,
        desplazamiento: items.length,
      });
      setItems([...items, ...mas]);
      setHayMas(mas.length === TAMANO_PAGINA);
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      cargandoMas.current = false;
    }
  };

  const secciones = useMemo(() => {
    const grupos: { titulo: string; dia: string; data: Movimiento[] }[] = [];
    let actual = '';
    for (const m of items ?? []) {
      if (ocultos.has(m.id)) continue;
      const dia = claveDia(m.fecha);
      if (dia !== actual) {
        actual = dia;
        grupos.push({ titulo: formatearDia(m.fecha), dia, data: [] });
      }
      grupos[grupos.length - 1].data.push(m);
    }
    return grupos;
  }, [items, ocultos]);

  if (!items) return <ActivityIndicator style={styles.cargando} />;

  return (
    <View style={styles.flex}>
    <SectionList
      sections={secciones}
      keyExtractor={(m) => String(m.id)}
      // Cada día va en su propia tarjeta redondeada (como en Rial).
      renderItem={({ item, index, section }) => (
        <View
          style={[
            styles.tarjeta,
            { backgroundColor: tema.colors.surfaceVariant },
            index === 0 && styles.primera,
            index === section.data.length - 1 && styles.ultima,
          ]}
        >
          <FilaDeslizable onEliminar={() => eliminar(item)} onDuplicar={duplicable(item) ? () => duplicar(item) : undefined}>
            <View style={{ backgroundColor: tema.colors.surfaceVariant }}>
              <ItemMovimiento
                movimiento={item}
                billeteraId={filtro.billeteraId}
                enMeta={filtro.metaId !== undefined}
                onPress={() => router.push(`/movimiento/${item.id}`)}
              />
            </View>
          </FilaDeslizable>
        </View>
      )}
      renderSectionHeader={({ section }) => {
        const t = totalesDia?.get(section.dia);
        return (
          <View style={[styles.seccion, { backgroundColor: tema.colors.background }]}>
            <Text variant="labelLarge" style={[styles.flex, { color: tema.colors.onSurfaceVariant }]}>
              {section.titulo}
            </Text>
            {t && monedaTotales && t.ingresos > 0 && (
              <Text variant="labelLarge" style={[styles.total, { color: tema.dark ? COLOR_INGRESO_OSCURO : COLOR_INGRESO }]}>
                {`+${formatearMonto(t.ingresos, monedaTotales)}`}
              </Text>
            )}
            {t && monedaTotales && t.gastos > 0 && (
              <Text variant="labelLarge" style={[styles.total, { color: tema.dark ? COLOR_GASTO_OSCURO : COLOR_GASTO }]}>
                {`-${formatearMonto(t.gastos, monedaTotales)}`}
              </Text>
            )}
          </View>
        );
      }}
      ListHeaderComponent={encabezado}
      ListEmptyComponent={
        <View style={styles.vacio}>
          <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant, textAlign: 'center' }}>
            {textoVacio}
          </Text>
        </View>
      }
      ListFooterComponent={hayMas && items.length > 0 ? <ActivityIndicator style={styles.pie} /> : null}
      onEndReached={cargarMas}
      onEndReachedThreshold={0.5}
      contentContainerStyle={{ paddingBottom: 96 }}
      refreshControl={
        <RefreshControl
          refreshing={refrescando}
          onRefresh={async () => {
            setRefrescando(true);
            await recargar().catch(() => {});
            await onRefrescar?.();
            setRefrescando(false);
          }}
          colors={[tema.colors.onPrimaryContainer]}
          progressBackgroundColor={tema.colors.primaryContainer}
        />
      }
      stickySectionHeadersEnabled={false}
    />
      <Snackbar
        visible={aviso !== null}
        onDismiss={() => setAviso(null)}
        duration={ESPERA_BORRADO}
        action={{ label: 'Deshacer', onPress: deshacer }}
      >
        {aviso}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  cargando: { marginTop: 48 },
  seccion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  flex: { flex: 1 },
  total: { fontVariant: ['tabular-nums'] },
  tarjeta: { marginHorizontal: 16, overflow: 'hidden' },
  primera: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 4 },
  ultima: { borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingBottom: 4 },
  vacio: { padding: 32 },
  pie: { marginVertical: 16 },
});
