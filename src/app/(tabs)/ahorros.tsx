import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, FAB, List, Text, useTheme } from 'react-native-paper';

import { TarjetaMeta } from '../../components/TarjetaMeta';
import { listarMetas, type Meta } from '../../db/metas';

export default function PantallaAhorros() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [metas, setMetas] = useState<Meta[] | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listarMetas(db, { incluirArchivadas: true })
        .then(setMetas)
        .catch((e) => Alert.alert('Error', String(e)));
    }, [db]),
  );

  if (!metas) return <ActivityIndicator style={styles.cargando} />;

  const activas = metas.filter((m) => !m.archivada);
  const archivadas = metas.filter((m) => m.archivada);
  const abrir = (m: Meta) => router.push(`/meta/${m.id}`);

  return (
    <View style={styles.flex}>
      <FlatList
        data={activas}
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item }) => <TarjetaMeta meta={item} onPress={() => abrir(item)} />}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 96 }}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Text variant="titleMedium" style={styles.centrado}>
              Sin metas de ahorro
            </Text>
            <Text variant="bodyMedium" style={[styles.centrado, { color: tema.colors.onSurfaceVariant }]}>
              Crea una meta y ve apartando dinero de tus billeteras. Lo que abonas sale de la billetera pero sigue
              contando en tu patrimonio.
            </Text>
            <Button mode="contained" icon="flag-plus" onPress={() => router.push('/meta/nueva')}>
              Crear una meta
            </Button>
          </View>
        }
        ListFooterComponent={
          archivadas.length > 0 ? (
            <List.Accordion
              title={`Archivadas (${archivadas.length})`}
              expanded={verArchivadas}
              onPress={() => setVerArchivadas((v) => !v)}
              style={{ backgroundColor: tema.colors.background }}
            >
              {archivadas.map((m) => (
                <TarjetaMeta key={m.id} meta={m} onPress={() => abrir(m)} />
              ))}
            </List.Accordion>
          ) : null
        }
      />
      {activas.length > 0 && (
        <FAB icon="plus" label="Meta" style={styles.fab} onPress={() => router.push('/meta/nueva')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cargando: { marginTop: 48 },
  vacio: { padding: 24, gap: 12, marginTop: 32 },
  centrado: { textAlign: 'center' },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
