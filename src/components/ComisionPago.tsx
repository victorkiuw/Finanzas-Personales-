import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Switch, Text, TextInput, useTheme } from 'react-native-paper';

import type { Billetera } from '../db/billeteras';
import {
  calcularComision,
  comisionPara,
  describirComision,
  destinoPorDefecto,
  tieneComision,
  type DestinoPago,
} from '../lib/comision';
import { centimosATexto, formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';

/**
 * Comisión bancaria de un pago (Pago Móvil): en bolívares se elige si es a
 * persona o a comercio y se calcula sola; en otras monedas se escribe a mano.
 * Avisa por `onComision` los céntimos a registrar (0 si no hay).
 */
export function ComisionPago({
  billetera,
  monto,
  onComision,
  activaInicial,
  destinoInicial,
}: {
  billetera: Billetera | null;
  /** Lo que sale de la billetera, en su moneda. */
  monto: number | null;
  onComision: (centimos: number) => void;
  activaInicial?: boolean;
  destinoInicial?: DestinoPago;
}) {
  const tema = useTheme();
  const config = { porcentaje: billetera?.comision_porcentaje ?? 0, minima: billetera?.comision_minima ?? 0 };
  const [usar, setUsar] = useState<boolean | null>(activaInicial ?? null);
  const [destino, setDestino] = useState<DestinoPago | null>(destinoInicial ?? null);
  const [texto, setTexto] = useState('');
  const pagoMovil = billetera?.moneda === 'BS';
  const activa = billetera !== null && (usar ?? tieneComision(config));
  const aQuien = destino ?? destinoPorDefecto(config);
  const cfg = pagoMovil ? comisionPara(aQuien, config) : config;
  const auto = monto && monto > 0 ? calcularComision(monto, cfg) : 0;
  const comision = !activa ? 0 : !pagoMovil && texto.trim() !== '' ? (parsearMonto(texto) ?? 0) : auto;

  useEffect(() => {
    onComision(comision);
  }, [comision]);

  if (!billetera) return null;
  return (
    <View style={styles.bloque}>
      <View style={styles.fila}>
        <View style={styles.flex}>
          <Text variant="labelLarge">Comisión bancaria</Text>
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            {activa
              ? `${formatearMonto(comision, billetera.moneda)} · se registra aparte en "Comisiones"`
              : tieneComision(cfg)
                ? `Desactivada (${describirComision(cfg, (c) => formatearMonto(c, billetera.moneda))})`
                : 'Sin comisión'}
          </Text>
        </View>
        <Switch value={activa} onValueChange={setUsar} accessibilityLabel="Cobrar comisión bancaria" />
      </View>
      {activa && pagoMovil && (
        <View style={styles.chips}>
          {(
            [
              ['PERSONA', 'A persona'],
              ['COMERCIO', 'A comercio'],
            ] as const
          ).map(([valor, nombre]) => (
            <Chip
              key={valor}
              compact
              selected={aQuien === valor}
              showSelectedCheck
              mode={aQuien === valor ? 'flat' : 'outlined'}
              onPress={() => setDestino(valor)}
            >
              {`${nombre} · ${String(comisionPara(valor, config).porcentaje).replace('.', ',')} %`}
            </Chip>
          ))}
        </View>
      )}
      {activa && !pagoMovil && (
        <TextInput
          label="Monto de la comisión"
          value={texto}
          onChangeText={setTexto}
          placeholder={auto ? centimosATexto(auto) : undefined}
          keyboardType="decimal-pad"
          mode="outlined"
          dense
          right={<TextInput.Affix text={INFO_MONEDA[billetera.moneda].corto} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bloque: { gap: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
