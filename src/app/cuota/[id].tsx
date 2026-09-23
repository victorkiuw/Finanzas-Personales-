import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Icon, ProgressBar, Text, useTheme } from 'react-native-paper';

import { DialogoPagoCuota } from '../../components/DialogoPagoCuota';
import { useTasas } from '../../components/TasasProvider';
import { eliminarCompra, obtenerCompra, type CompraCuotas } from '../../db/cuotas';
import { convertir } from '../../lib/conversion';
import { fechaSimpleLegible, formatearFechaCorta } from '../../lib/fechas';
import { formatearMonto } from '../../lib/moneda';

export default function DetalleCompraCuotas() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const tema = useTheme();
  const { tasas } = useTasas();
  const [compra, setCompra] = useState<CompraCuotas | null>(null);
  const [pagando, setPagando] = useState(false);

  const cargar = useCallback(() => {
    obtenerCompra(db, Number(id))
      .then((c) => (c ? setCompra(c) : router.back()))
      .catch((e) => Alert.alert('Error', String(e)));
  }, [db, id]);
  useFocusEffect(cargar);

  if (!compra) return null;
  const bcv = tasas.BCV?.tasa ?? null;
  const enBs = (usd: number) => (bcv ? formatearMonto(convertir(usd, 'USD', 'BS', { dolar: bcv, euro: null })!, 'BS') : null);
  const financiado = compra.total - compra.inicial;
  const pagado = financiado - compra.pendiente;

  const confirmarEliminar = () =>
    Alert.alert('¿Eliminar compra?', 'Se borrarán también la inicial y las cuotas pagadas, y los saldos se recalcularán.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarCompra(db, compra.id);
          router.back();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: compra.comercio }} />
      <ScrollView contentContainerStyle={styles.contenido}>
        <Card mode="contained">
          <Card.Content style={styles.bloque}>
            <Text variant="bodyMedium">
              {`Compraste ${formatearMonto(compra.total, 'USD')}${compra.descripcion ? ` (${compra.descripcion})` : ''} el ${formatearFechaCorta(new Date(compra.fecha))}, con ${formatearMonto(compra.inicial, 'USD')} de inicial.`}
            </Text>
            <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
              {compra.pendiente > 0 ? 'Te falta pagar' : 'Ya pagaste todo'}
            </Text>
            {compra.pendiente > 0 && (
              <Text variant="headlineSmall" style={styles.cifra}>
                {formatearMonto(compra.pendiente, 'USD')}
              </Text>
            )}
            <ProgressBar progress={financiado > 0 ? pagado / financiado : 1} style={styles.barra} />
            {compra.proxima && (
              <Text variant="bodyMedium">
                {`Próxima cuota: ${formatearMonto(compra.proxima.monto, 'USD')} el ${fechaSimpleLegible(compra.proxima.fecha)}`}
                {enBs(compra.proxima.monto) ? ` (hoy ${enBs(compra.proxima.monto)} a BCV)` : ''}
              </Text>
            )}
            <View style={styles.acciones}>
              {compra.proxima && (
                <Button mode="contained" icon="cash-check" onPress={() => setPagando(true)}>
                  Pagar cuota
                </Button>
              )}
              <Button mode="text" icon="delete" textColor={tema.colors.error} onPress={confirmarEliminar}>
                Eliminar
              </Button>
            </View>
          </Card.Content>
        </Card>

        <Text variant="titleMedium">Calendario de cuotas</Text>
        {compra.calendario.map((q) => (
          <View key={q.numero} style={[styles.cuota, { borderBottomColor: tema.colors.outlineVariant }]}>
            <Icon
              source={q.pagada ? 'check-circle' : q === compra.proxima ? 'clock-outline' : 'circle-outline'}
              size={20}
              color={q.pagada ? tema.colors.primary : tema.colors.onSurfaceVariant}
            />
            <Text variant="bodyMedium" style={styles.flex}>
              {`Cuota ${q.numero} · ${fechaSimpleLegible(q.fecha)}`}
            </Text>
            <Text variant="bodyMedium" style={[styles.cifra, q.pagada && { textDecorationLine: 'line-through' }]}>
              {formatearMonto(q.monto, 'USD')}
            </Text>
          </View>
        ))}
      </ScrollView>
      <DialogoPagoCuota
        compra={compra}
        visible={pagando}
        onCerrar={(pagado) => {
          setPagando(false);
          if (pagado) cargar();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: 16, gap: 12, paddingBottom: 48 },
  bloque: { gap: 8 },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  barra: { height: 6, borderRadius: 3 },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  cuota: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
