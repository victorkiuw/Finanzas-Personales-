import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet } from 'react-native';
import { IconButton, List, Text, useTheme } from 'react-native-paper';

import { useTasas } from '../components/TasasProvider';
import { fechaSimpleLegible } from '../lib/fechas';
import { compartirArchivo, hacerCopiaAutomatica, listarCopiasAutomaticas, restaurarCopiaAutomatica } from '../lib/respaldoAuto';

type Copia = ReturnType<typeof listarCopiasAutomaticas>[number];

export default function PantallaCopias() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { actualizar } = useTasas();
  const [copias, setCopias] = useState<Copia[]>([]);

  useEffect(() => {
    hacerCopiaAutomatica(db)
      .catch(() => {})
      .finally(() => {
        try {
          setCopias(listarCopiasAutomaticas());
        } catch (e) {
          Alert.alert('Error', String(e));
        }
      });
  }, [db]);

  const restaurar = (c: Copia) =>
    Alert.alert(
      `¿Volver al ${fechaSimpleLegible(c.dia)}?`,
      'Todos los datos actuales se reemplazarán por los de esa copia.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          style: 'destructive',
          onPress: async () => {
            try {
              await restaurarCopiaAutomatica(db, c.archivo);
              actualizar(true).catch(() => {});
              Alert.alert('Listo', 'Se restauró la copia.');
              router.dismissTo('/');
            } catch (e) {
              Alert.alert('No se pudo restaurar', `No se cambió nada. Detalle: ${String(e)}`);
            }
          },
        },
      ],
    );

  return (
    <>
      <Stack.Screen options={{ title: 'Copias automáticas' }} />
      <FlatList
        data={copias}
        keyExtractor={(c) => c.nombre}
        ListHeaderComponent={
          <Text variant="bodyMedium" style={[styles.ayuda, { color: tema.colors.onSurfaceVariant }]}>
            La app guarda una copia de tus datos cada día que la abres (las últimas 7). Sirven si borras algo por
            error. Si pierdes o cambias el teléfono se pierden con él: por eso conviene exportar una copia a Drive
            de vez en cuando (Ajustes → Exportar copia) o compartir una de estas.
          </Text>
        }
        renderItem={({ item }) => (
          <List.Item
            title={fechaSimpleLegible(item.dia)}
            description="Toca para restaurar"
            left={(p) => <List.Icon {...p} icon="history" />}
            onPress={() => restaurar(item)}
            right={() => (
              <IconButton
                icon="share-variant"
                accessibilityLabel="Compartir copia"
                onPress={async () => {
                  try {
                    await compartirArchivo(`finanzas-respaldo-${item.dia}.json`, await item.archivo.text(), 'application/json', 'Guardar copia de seguridad');
                  } catch (e) {
                    Alert.alert('No se pudo compartir', String(e));
                  }
                }}
              />
            )}
          />
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  ayuda: { padding: 16 },
});
