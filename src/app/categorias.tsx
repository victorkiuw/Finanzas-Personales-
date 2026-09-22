import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, SectionList, StyleSheet, View } from 'react-native';
import { Avatar, FAB, List, SegmentedButtons, Text, useTheme } from 'react-native-paper';

import { listarCategorias, type Categoria, type TipoCategoria } from '../db/categorias';

export default function PantallaCategorias() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [tipo, setTipo] = useState<TipoCategoria>('GASTO');
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  useFocusEffect(
    useCallback(() => {
      listarCategorias(db, undefined, { incluirArchivadas: true })
        .then(setCategorias)
        .catch((e) => Alert.alert('Error', String(e)));
    }, [db]),
  );

  const delTipo = categorias.filter((c) => c.tipo === tipo);
  const secciones = [
    { titulo: '', data: delTipo.filter((c) => !c.archivada) },
    { titulo: 'Archivadas', data: delTipo.filter((c) => c.archivada) },
  ].filter((s) => s.data.length > 0);

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Categorías' }} />
      <SegmentedButtons
        style={styles.selector}
        value={tipo}
        onValueChange={(v) => setTipo(v as TipoCategoria)}
        buttons={[
          { value: 'GASTO', label: 'Gastos', icon: 'arrow-up' },
          { value: 'INGRESO', label: 'Ingresos', icon: 'arrow-down' },
        ]}
      />
      <SectionList
        sections={secciones}
        keyExtractor={(c) => String(c.id)}
        renderSectionHeader={({ section }) =>
          section.titulo ? (
            <Text variant="labelLarge" style={[styles.seccion, { color: tema.colors.onSurfaceVariant }]}>
              {section.titulo}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <List.Item
            title={item.nombre}
            onPress={() => router.push(`/categoria/${item.id}`)}
            style={item.archivada && styles.archivada}
            left={() => (
              <Avatar.Icon size={36} icon={item.icono} color="#FFFFFF" style={[styles.icono, { backgroundColor: item.color_hex }]} />
            )}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
          />
        )}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      <FAB
        icon="plus"
        label="Categoría"
        style={styles.fab}
        onPress={() => router.push({ pathname: '/categoria/nueva', params: { tipo } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  selector: { margin: 16 },
  seccion: { paddingHorizontal: 16, paddingTop: 16 },
  archivada: { opacity: 0.55 },
  icono: { marginLeft: 16 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
