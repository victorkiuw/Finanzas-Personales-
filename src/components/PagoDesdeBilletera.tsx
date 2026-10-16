import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { HelperText, Text, TextInput } from 'react-native-paper';

import type { Billetera } from '../db/billeteras';
import { centimosATexto, equivalentes, formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';
import { enviadoConTasa, parsearTasa, recibidoConTasa, tasaATexto } from '../lib/tasa';
import { SelectorBilletera } from './SelectorBilletera';
import { SugerenciasTasa } from './SugerenciasTasa';
import { useTasas } from './TasasProvider';

/**
 * Elige la billetera con la que se paga un monto en dólares. Si la billetera no
 * es en dólares, pide la tasa (propone la BCV) y el monto que sale, y los
 * calcula en los dos sentidos. Devuelve por `onCambio` el monto en la moneda de
 * la billetera (null si falta algo).
 */
export function PagoDesdeBilletera({
  billeteras,
  usd,
  billeteraId,
  onBilletera,
  onMonto,
  etiqueta = 'Pagas con',
}: {
  billeteras: Billetera[];
  /** Céntimos de dólar a pagar. */
  usd: number | null;
  billeteraId: number | null;
  onBilletera: (id: number) => void;
  onMonto: (montoBilletera: number | null) => void;
  etiqueta?: string;
}) {
  const { tasas } = useTasas();
  const billetera = billeteras.find((b) => b.id === billeteraId) ?? null;
  const moneda = billetera?.moneda ?? 'USD';
  const conCambio = billetera !== null && !equivalentes(moneda, 'USD');
  const [tasaTexto, setTasaTexto] = useState('');
  const [montoTexto, setMontoTexto] = useState('');

  // Al elegir una billetera con cambio se propone la tasa BCV (la que usa Cashea).
  useEffect(() => {
    if (!conCambio) return;
    const sugerida = moneda === 'EUR' ? tasas.EURO?.tasa : tasas.BCV?.tasa;
    const t = moneda === 'EUR' && tasas.EURO && tasas.BCV ? tasas.EURO.tasa / tasas.BCV.tasa : sugerida;
    setTasaTexto(t ? tasaATexto(t) : '');
  }, [conCambio, moneda, tasas]);

  const tasa = parsearTasa(tasaTexto);
  useEffect(() => {
    if (!conCambio) {
      onMonto(usd);
      return;
    }
    if (usd && usd > 0 && tasa) {
      const m = enviadoConTasa(moneda, 'USD', usd, tasa);
      setMontoTexto(centimosATexto(m));
      onMonto(m);
    } else onMonto(parsearMonto(montoTexto));
    // Solo cuando cambia lo que hay que pagar, la tasa o la billetera.
  }, [usd, tasaTexto, conCambio, moneda]);

  const cambiarMonto = (t: string) => {
    setMontoTexto(t);
    const m = parsearMonto(t);
    onMonto(m);
  };

  return (
    <View style={styles.bloque}>
      <Text variant="labelLarge">{etiqueta}</Text>
      <SelectorBilletera billeteras={billeteras} valor={billeteraId} onCambio={onBilletera} />
      {billetera && (
        <Text variant="bodySmall">{`Disponible: ${formatearMonto(billetera.saldo, billetera.moneda)}`}</Text>
      )}
      {conCambio && (
        <>
          <View style={styles.fila}>
            <TextInput
              label={moneda === 'EUR' ? 'Tasa ($ por €)' : 'Tasa (Bs. por USD)'}
              value={tasaTexto}
              onChangeText={setTasaTexto}
              keyboardType="decimal-pad"
              mode="outlined"
              dense
              style={styles.flex}
            />
            <TextInput
              label="Sale de la billetera"
              value={montoTexto}
              onChangeText={cambiarMonto}
              keyboardType="decimal-pad"
              mode="outlined"
              dense
              style={styles.flex}
              right={<TextInput.Affix text={INFO_MONEDA[moneda].corto} />}
            />
          </View>
          <SugerenciasTasa de={moneda} a="USD" billeteras={[billetera]} onElegir={setTasaTexto} />
          {usd && tasa ? (
            <HelperText type="info">{`${formatearMonto(usd, 'USD')} = ${formatearMonto(recibidoConTasa('USD', moneda, usd, tasa), moneda)}`}</HelperText>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: { gap: 8 },
  fila: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
