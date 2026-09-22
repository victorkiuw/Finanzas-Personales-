import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, IconButton, Text, useTheme } from 'react-native-paper';

import { ListaMovimientos } from '../../components/ListaMovimientos';
import { obtenerBilletera, type Billetera } from '../../db/billeteras';
import { formatearMonto, INFO_MONEDA } from '../../lib/moneda';

export default function DetalleBilletera() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const billeteraId = Number(id);
  const db = useSQLiteContext();
  const tema = useTheme();
  const [billetera, setBilletera] = useState<Billetera | null>(null);

  useFocusEffect(
    useCallback(() => {
      obtenerBilletera(db, billeteraId)
        .then((b) => {
          if (b) setBilletera(b);
          else router.back();
        })
        .catch((e) => Alert.alert('Error', String(e)));
    }, [db, billeteraId]),
  );

  const nuevo = (tipo: string) =>
    router.push({ pathname: '/movimiento/nuevo', params: { tipo, billetera: String(billeteraId) } });

  const encabezado = billetera ? (
    <View>
      <Card mode="contained" style={styles.tarjeta}>
        <Card.Content style={styles.resumen}>
          <Avatar.Icon
            size={48}
            icon={billetera.icono}
            color="#FFFFFF"
            style={{ backgroundColor: billetera.color_hex }}
          />
          <View style={styles.flex}>
            <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
              {`Saldo · ${INFO_MONEDA[billetera.moneda].nombre}${billetera.archivada ? ' · Archivada' : ''}`}
            </Text>
            <Text
              variant="headlineMedium"
              style={[styles.saldo, billetera.saldo < 0 && { color: tema.colors.error }]}
            >
              {formatearMonto(billetera.saldo, billetera.moneda)}
            </Text>
          </View>
        </Card.Content>
      </Card>
      {!billetera.archivada && (
        <View style={styles.acciones}>
          <Button mode="contained-tonal" compact icon="arrow-up" onPress={() => nuevo('GASTO')} style={styles.flex}>
            Gasto
          </Button>
          <Button mode="contained-tonal" compact icon="arrow-down" onPress={() => nuevo('INGRESO')} style={styles.flex}>
            Ingreso
          </Button>
          <Button
            mode="contained-tonal"
            compact
            icon="swap-horizontal"
            onPress={() => nuevo('TRANSFERENCIA')}
            style={styles.flex}
          >
            Mover
          </Button>
        </View>
      )}
    </View>
  ) : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          title: billetera?.nombre ?? '',
          headerRight: () => (
            <IconButton
              icon="pencil"
              accessibilityLabel="Editar billetera"
              onPress={() => router.push(`/billetera/editar/${billeteraId}`)}
            />
          ),
        }}
      />
      <ListaMovimientos
        filtro={{ billeteraId }}
        encabezado={encabezado}
        textoVacio="Esta billetera aún no tiene movimientos."
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tarjeta: { margin: 16, marginBottom: 8 },
  resumen: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  saldo: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  acciones: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
});
