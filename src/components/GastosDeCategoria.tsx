import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';

import { listarMovimientos, type Movimiento } from '../db/movimientos';
import { ItemMovimiento } from './ItemMovimiento';

/** Los gastos de una categoría en un periodo, para verlos sin salir de Inicio. */
export function GastosDeCategoria({ categoriaId, desde, hasta }: { categoriaId: number; desde: string; hasta: string }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);

  useEffect(() => {
    let vigente = true;
    listarMovimientos(db, { categoriaId, tipo: 'GASTO', desde, hasta })
      .then((m) => vigente && setMovimientos(m))
      .catch(() => vigente && setMovimientos([]));
    return () => {
      vigente = false;
    };
  }, [db, categoriaId, desde, hasta]);

  if (!movimientos) return <ActivityIndicator style={styles.cargando} />;
  return (
    <View style={[styles.caja, { borderColor: tema.colors.outlineVariant }]}>
      {movimientos.length === 0 ? (
        <Text variant="bodySmall" style={[styles.vacio, { color: tema.colors.onSurfaceVariant }]}>
          Sin gastos en esta categoría.
        </Text>
      ) : (
        movimientos.map((m) => <ItemMovimiento key={m.id} movimiento={m} onPress={() => router.push(`/movimiento/${m.id}`)} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cargando: { marginVertical: 8 },
  caja: { borderLeftWidth: 2, marginLeft: 15, marginTop: 4 },
  vacio: { padding: 12 },
});
