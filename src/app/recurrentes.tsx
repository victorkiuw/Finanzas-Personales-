import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Avatar, FAB, List, Text, useTheme } from 'react-native-paper';

import { listarRecurrentes, NOMBRE_FRECUENCIA, type Recurrente } from '../db/recurrentes';
import { fechaSimpleLegible } from '../lib/fechas';
import { formatearMonto } from '../lib/moneda';

export default function PantallaRecurrentes() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [lista, setLista] = useState<Recurrente[]>([]);

  useFocusEffect(
    useCallback(() => {
      listarRecurrentes(db).then(setLista).catch((e) => Alert.alert('Error', String(e)));
    }, [db]),
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Recurrentes' }} />
      <FlatList
        data={lista}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListEmptyComponent={
          <Text variant="bodyMedium" style={[styles.vacio, { color: tema.colors.onSurfaceVariant }]}>
            Agrega lo que pagas o cobras siempre: alquiler, internet, teléfono, sueldo… Se registran solos o te aviso
            para confirmarlos.
          </Text>
        }
        renderItem={({ item: r }) => (
          <List.Item
            title={`${r.nombre} · ${r.tipo === 'GASTO' ? '-' : '+'}${formatearMonto(r.monto, r.billetera_moneda)}`}
            description={`${NOMBRE_FRECUENCIA[r.frecuencia]} · ${r.activo ? `próxima: ${fechaSimpleLegible(r.proxima_fecha)}` : 'pausado'} · ${r.automatico ? 'automático' : 'con aviso'}`}
            descriptionNumberOfLines={2}
            style={!r.activo && styles.inactivo}
            onPress={() => router.push(r.tipo === 'APORTE_META' ? `/meta/${r.meta_id}` : `/recurrente/${r.id}`)}
            left={() => (
              <Avatar.Icon size={36} icon={r.categoria_icono} color="#FFFFFF" style={[styles.icono, { backgroundColor: r.categoria_color }]} />
            )}
          />
        )}
      />
      <FAB icon="plus" label="Recurrente" style={styles.fab} onPress={() => router.push('/recurrente/nuevo')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  vacio: { padding: 24, textAlign: 'center' },
  inactivo: { opacity: 0.55 },
  icono: { marginLeft: 16 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
