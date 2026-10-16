import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Card, Dialog, Portal, Text, TextInput, useTheme } from 'react-native-paper';

import { confirmarRecurrente, saltarRecurrente, type Recurrente } from '../db/recurrentes';
import { actualizarAvisosRecurrentes } from '../lib/avisos';
import { fechaSimpleLegible } from '../lib/fechas';
import { centimosATexto, formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';

/** Recurrentes cuya fecha llegó y esperan que el usuario los confirme (o los salte). */
export function TarjetaPendientes({ pendientes, onCambio }: { pendientes: Recurrente[]; onCambio: () => void }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [confirmando, setConfirmando] = useState<Recurrente | null>(null);
  const [montoTexto, setMontoTexto] = useState('');

  if (pendientes.length === 0) return null;

  const hecho = async (accion: () => Promise<void>) => {
    try {
      await accion();
      await actualizarAvisosRecurrentes(db).catch(() => {});
      onCambio();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card mode="contained" style={[styles.tarjeta, { backgroundColor: tema.colors.secondaryContainer }]}>
      <Card.Title title="Por confirmar" subtitle="Pagos y cobros recurrentes de hoy o atrasados" />
      <Card.Content style={styles.lista}>
        {pendientes.map((r) => (
          <View key={r.id} style={styles.fila}>
            <View style={styles.flex}>
              <Text variant="bodyLarge">{`${r.nombre} · ${formatearMonto(r.monto, r.billetera_moneda)}`}</Text>
              <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                {`${fechaSimpleLegible(r.proxima_fecha)} · ${r.billetera_nombre}`}
              </Text>
            </View>
            <Button compact onPress={() => hecho(() => saltarRecurrente(db, r.id))}>
              Saltar
            </Button>
            <Button
              compact
              mode="contained"
              onPress={() => {
                setMontoTexto(centimosATexto(r.monto));
                setConfirmando(r);
              }}
            >
              Registrar
            </Button>
          </View>
        ))}
      </Card.Content>
      <Portal>
        <Dialog visible={confirmando !== null} onDismiss={() => setConfirmando(null)}>
          <Dialog.Title>{confirmando?.nombre}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Monto de esta vez"
              value={montoTexto}
              onChangeText={setMontoTexto}
              keyboardType="decimal-pad"
              mode="outlined"
              right={confirmando ? <TextInput.Affix text={INFO_MONEDA[confirmando.billetera_moneda].corto} /> : undefined}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmando(null)}>Cancelar</Button>
            <Button
              onPress={() => {
                const r = confirmando;
                const monto = parsearMonto(montoTexto);
                setConfirmando(null);
                if (r && monto && monto > 0) hecho(() => confirmarRecurrente(db, r.id, monto));
              }}
            >
              Registrar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tarjeta: { marginHorizontal: 16 },
  lista: { gap: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
