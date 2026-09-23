import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, Chip, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import { registrarPagoDeuda, type Deuda } from '../db/deudas';
import { centimosATexto, equivalentes, formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';
import { calcularTasa, parsearTasa, recibidoConTasa, tasaATexto, unidadTasa } from '../lib/tasa';
import { SelectorBilletera } from './SelectorBilletera';
import { SugerenciasTasa } from './SugerenciasTasa';

interface Props {
  deuda: Deuda;
  visible: boolean;
  onCerrar: (guardado: boolean) => void;
}

/** Registrar un cobro (me deben) o un pago (debo), en cualquier billetera y a la tasa pactada. */
export function DialogoPagoDeuda({ deuda, visible, onCerrar }: Props) {
  const db = useSQLiteContext();
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [billeteraId, setBilleteraId] = useState<number | null>(null);
  const [montoTexto, setMontoTexto] = useState('');
  const [tasaTexto, setTasaTexto] = useState('');
  const [equivalenteTexto, setEquivalenteTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [alturaTeclado, setAlturaTeclado] = useState(0);
  const { height: altoPantalla } = useWindowDimensions();

  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', (e) => setAlturaTeclado(e.endCoordinates.height));
    const b = Keyboard.addListener('keyboardDidHide', () => setAlturaTeclado(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setMontoTexto('');
    setTasaTexto('');
    setEquivalenteTexto('');
    setError(null);
    listarBilleteras(db).then((b) => {
      setBilleteras(b);
      // Por defecto, una billetera en la moneda original del préstamo.
      setBilleteraId((b.find((x) => x.moneda === deuda.moneda) ?? b[0])?.id ?? null);
    });
  }, [db, visible, deuda.moneda]);

  const meDeben = deuda.tipo === 'ME_DEBEN';
  const billetera = billeteras.find((b) => b.id === billeteraId) ?? null;
  const de = billetera?.moneda ?? deuda.unidad;
  const a = deuda.unidad;
  // USD y USDT se toman 1:1; con bolívares de por medio hace falta una tasa.
  const conCambio = billetera !== null && de !== a;
  const tasaPorDefecto = conCambio && equivalentes(de, a) ? 1 : null;
  const tasa = parsearTasa(tasaTexto) ?? tasaPorDefecto;
  const monto = parsearMonto(montoTexto);
  const equivalente = !conCambio
    ? monto
    : equivalenteTexto.trim() !== ''
      ? parsearMonto(equivalenteTexto)
      : monto && monto > 0 && tasa
        ? recibidoConTasa(de, a, monto, tasa)
        : null;

  const cambiarMonto = (t: string) => {
    setMontoTexto(t);
    const m = parsearMonto(t);
    const escrita = parsearTasa(tasaTexto);
    if (conCambio && m && m > 0 && escrita) setEquivalenteTexto(centimosATexto(recibidoConTasa(de, a, m, escrita)));
    else if (!escrita) setEquivalenteTexto('');
  };
  const cambiarTasa = (t: string) => {
    setTasaTexto(t);
    const nueva = parsearTasa(t);
    if (monto && monto > 0 && nueva) setEquivalenteTexto(centimosATexto(recibidoConTasa(de, a, monto, nueva)));
  };
  const cambiarEquivalente = (t: string) => {
    setEquivalenteTexto(t);
    const e = parsearMonto(t);
    if (monto && monto > 0 && e && e > 0) setTasaTexto(tasaATexto(calcularTasa(de, a, monto, e)));
  };

  /** Llena el monto con todo lo pendiente, convertido a la moneda de la billetera con la tasa actual. */
  const pagarTodo = () => {
    if (!conCambio) {
      setMontoTexto(centimosATexto(deuda.pendiente));
      return;
    }
    if (!tasa) {
      setError('Elige o escribe primero la tasa.');
      return;
    }
    // Inverso de recibidoConTasa: cuánto hay que mover en la billetera para cubrir lo pendiente.
    const necesario = recibidoConTasa(a, de, deuda.pendiente, tasa);
    setMontoTexto(centimosATexto(necesario));
    setEquivalenteTexto(centimosATexto(deuda.pendiente));
    setError(null);
  };

  const guardar = async () => {
    if (!billetera) return;
    if (!monto || monto <= 0) {
      setError('Escribe el monto.');
      return;
    }
    if (conCambio && (!equivalente || equivalente <= 0)) {
      setError('Indica la tasa o cuánto descuenta de la deuda.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await registrarPagoDeuda(db, {
        deuda_id: deuda.id,
        billetera_id: billetera.id,
        monto,
        monto_unidad: conCambio ? equivalente : null,
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
      <Dialog visible={visible} onDismiss={() => onCerrar(false)} style={{ marginBottom: alturaTeclado }}>
        <Dialog.Title>{meDeben ? `Cobro a ${deuda.persona}` : `Pago a ${deuda.persona}`}</Dialog.Title>
        <Dialog.ScrollArea style={[styles.area, { maxHeight: Math.max(altoPantalla - alturaTeclado - 260, 160) }]}>
          <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
            <Text variant="bodyMedium">{`Pendiente: ${formatearMonto(deuda.pendiente, deuda.unidad)}`}</Text>
            <Text variant="labelLarge">{meDeben ? 'Entra a' : 'Sale de'}</Text>
            <SelectorBilletera
              billeteras={billeteras}
              valor={billeteraId}
              onCambio={(id) => {
                setBilleteraId(id);
                setTasaTexto('');
                setEquivalenteTexto('');
              }}
            />

            {conCambio && (
              <>
                <TextInput
                  label={`Tasa (${unidadTasa(de, a)})`}
                  value={tasaTexto}
                  placeholder={tasaPorDefecto ? '1' : undefined}
                  onChangeText={cambiarTasa}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  dense
                />
                <SugerenciasTasa de={de} a={a} billeteras={[billetera]} onElegir={cambiarTasa} />
              </>
            )}

            <View style={styles.fila}>
              <TextInput
                label={meDeben ? 'Monto recibido' : 'Monto pagado'}
                value={montoTexto}
                onChangeText={cambiarMonto}
                keyboardType="decimal-pad"
                mode="outlined"
                style={styles.flex}
                right={<TextInput.Affix text={INFO_MONEDA[de].corto} />}
              />
              {conCambio && (
                <TextInput
                  label="Descuenta"
                  value={equivalenteTexto}
                  placeholder={equivalente ? centimosATexto(equivalente) : undefined}
                  onChangeText={cambiarEquivalente}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  style={styles.flex}
                  right={<TextInput.Affix text={INFO_MONEDA[a].corto} />}
                />
              )}
            </View>
            <Chip compact icon="check-all" onPress={pagarTodo} style={styles.chipTodo}>
              Todo lo pendiente
            </Chip>
            {equivalente !== null && equivalente > 0 && (
              <HelperText type="info">
                {`Descuenta ${formatearMonto(Math.min(equivalente, deuda.pendiente), a)}; quedarían ${formatearMonto(Math.max(deuda.pendiente - equivalente, 0), a)}.`}
              </HelperText>
            )}
            {error && <HelperText type="error">{error}</HelperText>}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={() => onCerrar(false)}>Cancelar</Button>
          <Button onPress={guardar} loading={guardando} disabled={guardando || !billetera}>
            Registrar
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  area: { paddingHorizontal: 0 },
  contenido: { paddingHorizontal: 24, paddingVertical: 12, gap: 12 },
  fila: { flexDirection: 'row', gap: 8 },
  chipTodo: { alignSelf: 'flex-start' },
});
