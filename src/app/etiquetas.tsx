import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { useTasas } from '../components/TasasProvider';
import { useConversor } from '../components/useConversor';
import { filasDeReporte, type FilaReporte } from '../db/reportes';
import { totalesPorEtiqueta } from '../lib/analisis';
import { fechaSimpleLegible } from '../lib/fechas';
import { formatearMonto } from '../lib/moneda';

/**
 * Etiquetas: escribe #viaje, #moto o #cumpleaños en la nota de un movimiento y
 * aquí ves cuánto llevas en cada una, aunque sean de categorías distintas.
 */
export default function PantallaEtiquetas() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { monedaBase } = useTasas();
  const conversor = useConversor();
  const [filas, setFilas] = useState<FilaReporte[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      filasDeReporte(db, '0000-01-01', '9999-12-31')
        .then((f) => setFilas(f.filter((x) => x.nota?.includes('#'))))
        .catch(() => setFilas([]));
    }, [db]),
  );

  const totales = useMemo(() => (filas && conversor ? totalesPorEtiqueta(filas, conversor, monedaBase) : []), [filas, conversor, monedaBase]);

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Etiquetas' }} />
      <FlatList
        data={totales}
        keyExtractor={(t) => t.etiqueta}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={
          <Text variant="bodyMedium" style={[styles.ayuda, { color: tema.colors.onSurfaceVariant }]}>
            Escribe una etiqueta con # en la nota de cualquier movimiento (por ejemplo "gasolina #viaje") y aquí verás cuánto
            llevas en total, aunque sean de categorías distintas. Toca una para ver sus movimientos.
          </Text>
        }
        ListEmptyComponent={
          filas ? (
            <Text variant="bodyMedium" style={[styles.ayuda, { color: tema.colors.onSurfaceVariant }]}>
              Aún no usas etiquetas.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.navigate({ pathname: '/movimientos', params: { buscar: item.etiqueta } })}
            style={[styles.tarjeta, { backgroundColor: tema.colors.surfaceVariant }]}
            accessibilityRole="button"
          >
            <View style={[styles.icono, { backgroundColor: tema.colors.secondaryContainer }]}>
              <Icon source="pound" size={22} color={tema.colors.onSecondaryContainer} />
            </View>
            <View style={styles.flex}>
              <Text variant="titleMedium">{item.etiqueta}</Text>
              <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                {`${item.cantidad} movimiento${item.cantidad === 1 ? '' : 's'} · último ${fechaSimpleLegible(item.ultima)}`}
              </Text>
            </View>
            <View style={styles.cifras}>
              {item.gastos > 0 && (
                <Text variant="titleSmall" style={[styles.cifra, { color: tema.dark ? '#F87171' : '#C62828' }]}>
                  {`-${formatearMonto(item.gastos, monedaBase)}`}
                </Text>
              )}
              {item.ingresos > 0 && (
                <Text variant="bodySmall" style={[styles.cifra, { color: tema.dark ? '#4ADE80' : '#2E7D32' }]}>
                  {`+${formatearMonto(item.ingresos, monedaBase)}`}
                </Text>
              )}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lista: { padding: 16, gap: 10, paddingBottom: 48 },
  ayuda: { marginBottom: 8 },
  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, padding: 14 },
  icono: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cifras: { alignItems: 'flex-end' },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '700' },
});
