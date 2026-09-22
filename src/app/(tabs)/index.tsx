import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, FAB, List, Text, useTheme } from 'react-native-paper';

import { CintaTasas } from '../../components/CintaTasas';
import { ResumenSaldo } from '../../components/ResumenSaldo';
import { TarjetaBilletera } from '../../components/TarjetaBilletera';
import { crearBilleterasSugeridas, listarBilleteras, type Billetera } from '../../db/billeteras';

export default function PantallaBilleteras() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [billeteras, setBilleteras] = useState<Billetera[] | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    setBilleteras(await listarBilleteras(db, { incluirArchivadas: true }));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch((e) => Alert.alert('Error', String(e)));
    }, [cargar]),
  );

  const crearSugeridas = async () => {
    setCreando(true);
    try {
      await crearBilleterasSugeridas(db);
      await cargar();
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setCreando(false);
    }
  };

  if (!billeteras) {
    return <ActivityIndicator style={styles.cargando} />;
  }

  const activas = billeteras.filter((b) => !b.archivada);
  const archivadas = billeteras.filter((b) => b.archivada);
  const abrir = (b: Billetera) => router.push(`/billetera/${b.id}`);

  return (
    <>
      <FlatList
        data={activas}
        keyExtractor={(b) => String(b.id)}
        renderItem={({ item }) => <TarjetaBilletera billetera={item} onPress={() => abrir(item)} />}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 96 }}
        ListHeaderComponent={
          <>
            <CintaTasas />
            {activas.length > 0 && <ResumenSaldo billeteras={activas} />}
          </>
        }
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Text variant="titleMedium" style={styles.centrado}>
              Aún no tienes billeteras
            </Text>
            <Text variant="bodyMedium" style={[styles.centrado, { color: tema.colors.onSurfaceVariant }]}>
              Crea una por cada lugar donde tienes dinero: efectivo en dólares, cuenta en bolívares,
              Binance…
            </Text>
            <Button mode="contained" icon="auto-fix" onPress={crearSugeridas} loading={creando} disabled={creando}>
              Crear Efectivo USD, Banco Bs. y Binance USDT
            </Button>
            <Button mode="text" onPress={() => router.push('/billetera/nueva')}>
              Crear una a mi medida
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
              {archivadas.map((b) => (
                <TarjetaBilletera key={b.id} billetera={b} onPress={() => abrir(b)} />
              ))}
            </List.Accordion>
          ) : null
        }
      />
      {activas.length > 0 && (
        <FAB
          icon="plus"
          label="Movimiento"
          style={[styles.fab, { bottom: 16 }]}
          onPress={() => router.push('/movimiento/nuevo')}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  cargando: { marginTop: 48 },
  vacio: { padding: 24, gap: 12, marginTop: 32 },
  centrado: { textAlign: 'center' },
  fab: { position: 'absolute', right: 16 },
});
