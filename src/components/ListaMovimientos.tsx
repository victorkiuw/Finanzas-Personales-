import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { Alert, SectionList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';

import { listarMovimientos, type FiltroMovimientos, type Movimiento } from '../db/movimientos';
import { claveDia, formatearDia } from '../lib/fechas';
import { formatearMonto, type Moneda } from '../lib/moneda';
import { COLOR_GASTO, COLOR_GASTO_OSCURO, COLOR_INGRESO, COLOR_INGRESO_OSCURO, ItemMovimiento } from './ItemMovimiento';

const TAMANO_PAGINA = 40;

interface Props {
  filtro: Omit<FiltroMovimientos, 'limite' | 'desplazamiento'>;
  /** Se muestra encima de la lista y se desplaza con ella. */
  encabezado?: ReactElement;
  textoVacio?: string;
  /** Ingresos y gastos de cada día (en `monedaTotales`) para mostrarlos junto a la fecha. */
  totalesDia?: Map<string, { ingresos: number; gastos: number }>;
  monedaTotales?: Moneda;
}

/** Lista paginada (scroll infinito) y agrupada por día; se recarga al volver a la pantalla. */
export function ListaMovimientos({ filtro, encabezado, textoVacio = 'No hay movimientos.', totalesDia, monedaTotales }: Props) {
  const db = useSQLiteContext();
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
      const dia = claveDia(m.fecha);
      if (dia !== actual) {
        actual = dia;
        grupos.push({ titulo: formatearDia(m.fecha), dia, data: [] });
      }
      grupos[grupos.length - 1].data.push(m);
    }
    return grupos;
  }, [items]);

  if (!items) return <ActivityIndicator style={styles.cargando} />;

  return (
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
          <ItemMovimiento
            movimiento={item}
            billeteraId={filtro.billeteraId}
            enMeta={filtro.metaId !== undefined}
            onPress={() => router.push(`/movimiento/${item.id}`)}
          />
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
      stickySectionHeadersEnabled={false}
    />
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
