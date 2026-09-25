import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';

import { ErrorValidacion } from '../db/billeteras';
import { tomarPrestadoDeAjeno, totalEnUnidad, type Deuda } from '../db/deudas';
import { NOMBRE_PAR } from '../lib/api-tasas';
import { centimosATexto, formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';
import { parsearTasa, tasaATexto } from '../lib/tasa';
import { useTasas } from './TasasProvider';

/**
 * Tomar prestado de un dinero ajeno que guardo: lo guardado baja y queda una
 * deuda con esa persona, sin mover saldos (el dinero ya está en mi billetera).
 */
export function DialogoTomarPrestado({
  ajeno,
  visible,
  onCerrar,
}: {
  ajeno: Deuda;
  visible: boolean;
  onCerrar: (deudaId: number | null) => void;
}) {
  const db = useSQLiteContext();
  const { tasas, referencia } = useTasas();
  const [montoTexto, setMontoTexto] = useState('');
  const [enDolares, setEnDolares] = useState(true);
  const [tasaTexto, setTasaTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const bs = ajeno.moneda === 'BS';

  useEffect(() => {
    if (!visible) return;
    setMontoTexto('');
    setError(null);
    setEnDolares(true);
    const hoy = tasas[referencia]?.tasa;
    setTasaTexto(hoy ? tasaATexto(hoy) : '');
  }, [visible, tasas, referencia]);

  const monto = parsearMonto(montoTexto);
  const tasa = parsearTasa(tasaTexto);
  const usaTasa = bs && enDolares;

  const guardar = async () => {
    setError(null);
    if (!monto || monto <= 0) {
      setError('Escribe el monto.');
      return;
    }
    if (usaTasa && !tasa) {
      setError('Escribe a cuánto está el dólar hoy.');
      return;
    }
    setGuardando(true);
    try {
      const id = await tomarPrestadoDeAjeno(db, {
        ajeno_id: ajeno.id,
        monto,
        tasa_referencia: usaTasa ? tasa : null,
        fecha: new Date().toISOString(),
      });
      onCerrar(id);
    } catch (e) {
      setError(e instanceof ErrorValidacion ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={() => onCerrar(null)}>
        <Dialog.Title>{`Tomar prestado de lo de ${ajeno.persona}`}</Dialog.Title>
        <Dialog.Content style={styles.contenido}>
          <Text variant="bodyMedium">
            {`Tiene ${formatearMonto(ajeno.pendiente, ajeno.unidad)} en tu cuenta. Lo que tomes queda como algo que le debes. Tu saldo no cambia.`}
          </Text>
          <TextInput
            label="¿Cuánto tomas?"
            value={montoTexto}
            onChangeText={setMontoTexto}
            keyboardType="decimal-pad"
            mode="outlined"
            right={<TextInput.Affix text={INFO_MONEDA[ajeno.moneda].corto} />}
          />
          <Chip compact icon="check-all" style={styles.izquierda} onPress={() => setMontoTexto(centimosATexto(ajeno.pendiente))}>
            Todo
          </Chip>
          {bs && (
            <View style={styles.bloque}>
              <View style={styles.chips}>
                <Chip compact selected={enDolares} showSelectedCheck={false} mode={enDolares ? 'flat' : 'outlined'} onPress={() => setEnDolares(true)}>
                  Llevarlo en dólares
                </Chip>
                <Chip compact selected={!enDolares} showSelectedCheck={false} mode={!enDolares ? 'flat' : 'outlined'} onPress={() => setEnDolares(false)}>
                  Devolver los mismos Bs.
                </Chip>
              </View>
              {enDolares && (
                <>
                  <TextInput
                    label={`Dólar de hoy (${NOMBRE_PAR[referencia]}, Bs.)`}
                    value={tasaTexto}
                    onChangeText={setTasaTexto}
                    keyboardType="decimal-pad"
                    mode="outlined"
                    dense
                  />
                  {monto && monto > 0 && tasa ? (
                    <HelperText type="info">
                      {`Le deberás ${formatearMonto(totalEnUnidad(monto, 'BS', tasa), 'USD')}: al devolverlo, los bolívares se calculan con el dólar de ese día.`}
                    </HelperText>
                  ) : null}
                </>
              )}
            </View>
          )}
          {error && <HelperText type="error">{error}</HelperText>}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => onCerrar(null)}>Cancelar</Button>
          <Button onPress={guardar} loading={guardando} disabled={guardando}>
            Tomar
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  contenido: { gap: 12 },
  bloque: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  izquierda: { alignSelf: 'flex-start' },
});
