import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import { moverFondosMeta, type Meta } from '../db/metas';
import { NOMBRE_PAR, PARES } from '../lib/api-tasas';
import { centimosATexto, formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';
import { calcularTasa, formatearTasa, hayBolivar, parsearTasa, recibidoConTasa, tasaATexto, unidadTasa } from '../lib/tasa';
import { SelectorBilletera } from './SelectorBilletera';
import { useTasas } from './TasasProvider';

interface Props {
  meta: Meta;
  tipo: 'APORTE_META' | 'RETIRO_META' | null;
  onCerrar: (guardado: boolean) => void;
}

/** Abonar dinero de una billetera a la meta, o retirarlo de la meta a una billetera. */
export function DialogoFondosMeta({ meta, tipo, onCerrar }: Props) {
  const db = useSQLiteContext();
  const { tasas } = useTasas();
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [billeteraId, setBilleteraId] = useState<number | null>(null);
  const [montoTexto, setMontoTexto] = useState('');
  const [equivalenteTexto, setEquivalenteTexto] = useState('');
  const [tasaTexto, setTasaTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!tipo) return;
    setMontoTexto('');
    setEquivalenteTexto('');
    setTasaTexto('');
    setError(null);
    listarBilleteras(db).then((b) => {
      setBilleteras(b);
      // Por defecto, una billetera en la misma moneda de la meta.
      setBilleteraId((b.find((x) => x.moneda === meta.moneda) ?? b[0])?.id ?? null);
    });
  }, [db, tipo, meta.moneda]);

  const aporte = tipo === 'APORTE_META';
  const billetera = billeteras.find((b) => b.id === billeteraId) ?? null;
  const conCambio = billetera !== null && billetera.moneda !== meta.moneda;
  // La conversión va en el sentido del dinero: billetera → meta al abonar, meta → billetera al retirar.
  const [de, a] = billetera ? (aporte ? [billetera.moneda, meta.moneda] : [meta.moneda, billetera.moneda]) : [meta.moneda, meta.moneda];
  // "monto" es lo que sale (billetera al abonar, meta al retirar); "equivalente" lo que llega.
  const monto = parsearMonto(montoTexto);
  const equivalente = parsearMonto(equivalenteTexto);

  const cambiarMonto = (t: string) => {
    setMontoTexto(t);
    const m = parsearMonto(t);
    const tasa = parsearTasa(tasaTexto);
    if (conCambio && m && m > 0 && tasa) setEquivalenteTexto(centimosATexto(recibidoConTasa(de, a, m, tasa)));
  };
  const cambiarTasa = (t: string) => {
    setTasaTexto(t);
    const tasa = parsearTasa(t);
    if (monto && monto > 0 && tasa) setEquivalenteTexto(centimosATexto(recibidoConTasa(de, a, monto, tasa)));
  };
  const cambiarEquivalente = (t: string) => {
    setEquivalenteTexto(t);
    const e = parsearMonto(t);
    if (monto && monto > 0 && e && e > 0) setTasaTexto(tasaATexto(calcularTasa(de, a, monto, e)));
  };

  const guardar = async () => {
    if (!tipo || !billetera) return;
    if (!monto || monto <= 0) {
      setError('Escribe un monto mayor que cero.');
      return;
    }
    if (conCambio && (!equivalente || equivalente <= 0)) {
      setError('Indica la tasa o el equivalente.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await moverFondosMeta(db, {
        tipo,
        meta_id: meta.id,
        billetera_id: billetera.id,
        // moverFondosMeta recibe el monto en moneda de la billetera y el de la meta por separado.
        monto: conCambio ? (aporte ? monto : equivalente!) : monto,
        monto_meta: conCambio ? (aporte ? equivalente : monto) : null,
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
      <Dialog visible={tipo !== null} onDismiss={() => onCerrar(false)}>
        <Dialog.Title>{aporte ? `Abonar a ${meta.nombre}` : `Retirar de ${meta.nombre}`}</Dialog.Title>
        <Dialog.ScrollArea style={styles.area}>
          <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
            <Text variant="labelLarge">{aporte ? 'Sale de' : 'Entra a'}</Text>
            <SelectorBilletera
              billeteras={billeteras}
              valor={billeteraId}
              onCambio={(id) => {
                // Otra billetera puede ser otra moneda: la tasa anterior ya no aplica.
                setBilleteraId(id);
                setTasaTexto('');
                setEquivalenteTexto('');
              }}
            />
            {billetera && (
              <Text variant="bodySmall">
                {aporte
                  ? `Disponible: ${formatearMonto(billetera.saldo, billetera.moneda)}`
                  : `En la meta: ${formatearMonto(meta.saldo, meta.moneda)}`}
              </Text>
            )}

            <TextInput
              label={aporte ? 'Monto a abonar' : 'Monto a retirar'}
              value={montoTexto}
              onChangeText={cambiarMonto}
              keyboardType="decimal-pad"
              mode="outlined"
              right={<TextInput.Affix text={INFO_MONEDA[de].corto} />}
            />

            {conCambio && (
              <>
                <View style={styles.fila}>
                  <TextInput
                    label={`Tasa (${unidadTasa(de, a)})`}
                    value={tasaTexto}
                    onChangeText={cambiarTasa}
                    keyboardType="decimal-pad"
                    mode="outlined"
                    style={styles.flex}
                  />
                  <TextInput
                    label="Equivale a"
                    value={equivalenteTexto}
                    onChangeText={cambiarEquivalente}
                    keyboardType="decimal-pad"
                    mode="outlined"
                    style={styles.flex}
                    right={<TextInput.Affix text={INFO_MONEDA[a].corto} />}
                  />
                </View>
                {hayBolivar(de, a) && (
                  <View style={styles.chips}>
                    {PARES.filter((p) => tasas[p]).map((p) => (
                      <Chip key={p} compact icon="lightning-bolt" onPress={() => cambiarTasa(tasaATexto(tasas[p]!.tasa))}>
                        {`${NOMBRE_PAR[p]} ${formatearTasa(tasas[p]!.tasa)}`}
                      </Chip>
                    ))}
                  </View>
                )}
              </>
            )}
            {error && <HelperText type="error">{error}</HelperText>}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={() => onCerrar(false)}>Cancelar</Button>
          <Button onPress={guardar} loading={guardando} disabled={guardando || !billetera}>
            {aporte ? 'Abonar' : 'Retirar'}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
