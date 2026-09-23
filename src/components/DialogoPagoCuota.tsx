import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text } from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import { pagarCuota, type CompraCuotas } from '../db/cuotas';
import { formatearMonto } from '../lib/moneda';
import { PagoDesdeBilletera } from './PagoDesdeBilletera';

/** Paga la próxima cuota de una compra desde una billetera (con la tasa BCV si es en bolívares). */
export function DialogoPagoCuota({
  compra,
  visible,
  onCerrar,
}: {
  compra: CompraCuotas;
  visible: boolean;
  onCerrar: (pagado: boolean) => void;
}) {
  const db = useSQLiteContext();
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [billeteraId, setBilleteraId] = useState<number | null>(null);
  const [montoBilletera, setMontoBilletera] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const usd = compra.proxima ? Math.min(compra.proxima.monto, compra.pendiente) : compra.pendiente;

  useEffect(() => {
    if (!visible) return;
    setError(null);
    listarBilleteras(db)
      .then((b) => {
        setBilleteras(b);
        setBilleteraId((actual) => actual ?? b[0]?.id ?? null);
      })
      .catch(() => {});
  }, [db, visible]);

  const pagar = async () => {
    if (!billeteraId) return;
    setGuardando(true);
    setError(null);
    try {
      await pagarCuota(db, {
        compra_id: compra.id,
        billetera_id: billeteraId,
        usd,
        monto_billetera: montoBilletera,
        fecha: new Date().toISOString(),
      });
      onCerrar(true);
    } catch (e) {
      setError(e instanceof ErrorValidacion ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={() => onCerrar(false)}>
        <Dialog.Title>{`Cuota ${compra.proxima?.numero ?? ''} de ${compra.comercio}`}</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
            <Text variant="titleMedium">{`A pagar: ${formatearMonto(usd, 'USD')}`}</Text>
            <PagoDesdeBilletera
              billeteras={billeteras}
              usd={usd}
              billeteraId={billeteraId}
              onBilletera={setBilleteraId}
              onMonto={setMontoBilletera}
            />
            {error && <HelperText type="error">{error}</HelperText>}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={() => onCerrar(false)}>Cancelar</Button>
          <Button onPress={pagar} loading={guardando} disabled={guardando || !billeteraId}>
            Pagar
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  contenido: { gap: 12, paddingVertical: 12 },
});
