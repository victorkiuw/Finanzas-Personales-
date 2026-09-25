import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';

import { ErrorValidacion } from '../db/billeteras';
import { entradaDineroAjeno, type Deuda } from '../db/deudas';
import { INFO_MONEDA, parsearMonto } from '../lib/moneda';

/** A la otra persona le entró dinero en mi cuenta: sube el saldo y sube lo suyo. */
export function DialogoEntradaAjeno({
  ajeno,
  visible,
  onCerrar,
}: {
  ajeno: Deuda;
  visible: boolean;
  onCerrar: (guardado: boolean) => void;
}) {
  const db = useSQLiteContext();
  const [montoTexto, setMontoTexto] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMontoTexto('');
    setNota('');
    setError(null);
  }, [visible]);

  const guardar = async () => {
    const monto = parsearMonto(montoTexto);
    if (!monto || monto <= 0) {
      setError('Escribe el monto.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await entradaDineroAjeno(db, { ajeno_id: ajeno.id, monto, fecha: new Date().toISOString(), nota });
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
        <Dialog.Title>{`Le entró dinero a ${ajeno.persona}`}</Dialog.Title>
        <Dialog.Content style={styles.contenido}>
          <Text variant="bodyMedium">
            {`Dinero de ${ajeno.persona} que llegó a tu ${ajeno.billetera_nombre ?? 'billetera'}. Sube el saldo, pero es suyo.`}
          </Text>
          <TextInput
            label="¿Cuánto entró?"
            value={montoTexto}
            onChangeText={setMontoTexto}
            keyboardType="decimal-pad"
            mode="outlined"
            autoFocus
            right={<TextInput.Affix text={INFO_MONEDA[ajeno.moneda].corto} />}
          />
          <TextInput label="Nota (opcional)" value={nota} onChangeText={setNota} mode="outlined" dense />
          {error && <HelperText type="error">{error}</HelperText>}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => onCerrar(false)}>Cancelar</Button>
          <Button onPress={guardar} loading={guardando} disabled={guardando}>
            Registrar
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  contenido: { gap: 12 },
});
