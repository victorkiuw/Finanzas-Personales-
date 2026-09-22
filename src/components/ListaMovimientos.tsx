import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { Alert, SectionList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';

import { listarMovimientos, type FiltroMovimientos, type Movimiento } from '../db/movimientos';
import { claveDia, formatearDia } from '../lib/fechas';
import { ItemMovimiento } from './ItemMovimiento';

const TAMANO_PAGINA = 40;

interface Props {
  filtro: Omit<FiltroMovimientos, 'limite' | 'desplazamiento'>;
  /** Se muestra encima de la lista y se desplaza con ella. */
  encabezado?: ReactElement;
  textoVacio?: string;
}

/** Lista paginada (scroll infinito) y agrupada por día; se recarga al volver a la pantalla. */
export function ListaMovimientos({ filtro, encabezado, textoVacio = 'No hay movimientos.' }: Props) {
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
    const grupos: { titulo: string; data: Movimiento[] }[] = [];
    let actual = '';
    for (const m of items ?? []) {
      const dia = claveDia(m.fecha);
      if (dia !== actual) {
        actual = dia;
        grupos.push({ titulo: formatearDia(m.fecha), data: [] });
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
      renderItem={({ item }) => (
        <ItemMovimiento
          movimiento={item}
          billeteraId={filtro.billeteraId}
          enMeta={filtro.metaId !== undefined}
          onPress={() => router.push(`/movimiento/${item.id}`)}
        />
      )}
      renderSectionHeader={({ section }) => (
        <Text
          variant="labelLarge"
          style={[styles.seccion, { color: tema.colors.onSurfaceVariant, backgroundColor: tema.colors.background }]}
        >
          {section.titulo}
        </Text>
      )}
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
      stickySectionHeadersEnabled
    />
  );
}

const styles = StyleSheet.create({
  cargando: { marginTop: 48 },
  seccion: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  vacio: { padding: 32 },
  pie: { marginVertical: 16 },
});
