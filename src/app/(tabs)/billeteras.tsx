import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, FAB, List, Text, useTheme } from 'react-native-paper';

import { CintaTasas } from '../../components/CintaTasas';
import { ResumenSaldo } from '../../components/ResumenSaldo';
import { TarjetaBilletera } from '../../components/TarjetaBilletera';
import { TarjetaDeuda } from '../../components/TarjetaDeuda';
import { useTasas } from '../../components/TasasProvider';
import { crearBilleterasSugeridas, listarBilleteras, type Billetera } from '../../db/billeteras';
import { ajenoPorBilletera, listarDeudas, type Deuda } from '../../db/deudas';
import { listarMetas, type Meta } from '../../db/metas';
import { formatearMonto } from '../../lib/moneda';

export default function PantallaBilleteras() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [billeteras, setBilleteras] = useState<Billetera[] | null>(null);
  const [metas, setMetas] = useState<Meta[]>([]);
  // Deudas abiertas: de aquí sale el dinero de otras personas en mis cuentas.
  const [deudas, setDeudas] = useState<Deuda[]>([]);
  const { tasas, referencia } = useTasas();
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    const [b, m, d] = await Promise.all([
      listarBilleteras(db, { incluirArchivadas: true }),
      listarMetas(db),
      listarDeudas(db, { incluirCerradas: false }),
    ]);
    setBilleteras(b);
    setMetas(m);
    setDeudas(d);
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
  const ajenoPor = ajenoPorBilletera(deudas);
  // Dinero de otras personas, agrupado por billetera.
  const ajenas = deudas.filter((d) => d.ajeno && d.pendiente > 0);
  const grupos = activas
    .map((b) => ({ billetera: b, personas: ajenas.filter((d) => d.billetera_id === b.id) }))
    .filter((g) => g.personas.length > 0);

  return (
    <>
      <FlatList
        data={activas}
        keyExtractor={(b) => String(b.id)}
        renderItem={({ item }) => (
          <TarjetaBilletera billetera={item} deOtros={ajenoPor.get(item.id)} onPress={() => abrir(item)} />
        )}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 96 }}
        ListHeaderComponent={
          <>
            <CintaTasas />
            {activas.length > 0 && <ResumenSaldo billeteras={activas} metas={metas} deudas={deudas} />}
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
          <>
            {activas.length > 0 && (
              <Button mode="outlined" icon="wallet-plus" style={styles.nueva} onPress={() => router.push('/billetera/nueva')}>
                Agregar billetera
              </Button>
            )}
            {activas.length > 0 && (
              <View>
                <Text variant="titleMedium" style={styles.subtitulo}>
                  Dinero de otros
                </Text>
                <Text variant="bodySmall" style={[styles.explicacion, { color: tema.colors.onSurfaceVariant }]}>
                  {grupos.length > 0
                    ? 'Lo que es de otras personas en tus cuentas. No cuenta en tu disponible.'
                    : '¿Le prestaste tu cuenta a alguien o te dieron dinero a guardar? Regístralo para que no cuente como tuyo.'}
                </Text>
                {grupos.map((g) => (
                  <View key={g.billetera.id}>
                    <Text variant="labelLarge" style={styles.explicacion}>
                      {`${g.billetera.nombre} · tuyo: ${formatearMonto(g.billetera.saldo - (ajenoPor.get(g.billetera.id) ?? 0), g.billetera.moneda)}`}
                    </Text>
                    {g.personas.map((d) => (
                      <TarjetaDeuda key={d.id} deuda={d} tasas={tasas} referencia={referencia} onPress={() => router.push(`/deuda/${d.id}`)} />
                    ))}
                  </View>
                ))}
                <Button mode="outlined" icon="account-cash" style={styles.nueva} onPress={() => router.push('/ajeno/nuevo')}>
                  Le presté mi cuenta a alguien
                </Button>
              </View>
            )}
            {archivadas.length > 0 && (
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
            )}
          </>
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
  subtitulo: { marginHorizontal: 16, marginTop: 8 },
  explicacion: { marginHorizontal: 16, marginBottom: 8 },
  vacio: { padding: 24, gap: 12, marginTop: 32 },
  centrado: { textAlign: 'center' },
  fab: { position: 'absolute', right: 16 },
  nueva: { marginHorizontal: 16, marginBottom: 12 },
});
