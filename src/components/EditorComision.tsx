import { StyleSheet, View } from 'react-native';
import { Chip, HelperText, Text, TextInput } from 'react-native-paper';

import { describirComision, PRESETS_COMISION, type ConfigComision } from '../lib/comision';
import { centimosATexto, formatearMonto, INFO_MONEDA, parsearMonto, type Moneda } from '../lib/moneda';

interface Props {
  moneda: Moneda;
  porcentajeTexto: string;
  minimaTexto: string;
  onCambio: (porcentajeTexto: string, minimaTexto: string) => void;
}

/** Texto de un porcentaje para el campo, p. ej. 0.3 → "0,3". */
export function porcentajeATexto(p: number): string {
  return p ? String(p).replace('.', ',') : '';
}

/** Convierte los textos del editor a configuración; null si algo no es un número válido. */
export function leerComision(porcentajeTexto: string, minimaTexto: string): ConfigComision | null {
  const p = porcentajeTexto.trim() === '' ? 0 : Number(porcentajeTexto.trim().replace(',', '.'));
  const m = minimaTexto.trim() === '' ? 0 : parsearMonto(minimaTexto);
  if (!Number.isFinite(p) || p < 0 || m === null || m < 0) return null;
  return { porcentaje: p, minima: m };
}

/** Comisión que cobra el banco al pagar desde la billetera (Pago Móvil). */
export function EditorComision({ moneda, porcentajeTexto, minimaTexto, onCambio }: Props) {
  const actual = leerComision(porcentajeTexto, minimaTexto);
  const formatear = (c: number) => formatearMonto(c, moneda);

  return (
    <View style={styles.bloque}>
      <Text variant="labelLarge">Comisión al pagar desde esta billetera</Text>
      <View style={styles.chips}>
        {PRESETS_COMISION.map((p) => {
          const elegido = actual?.porcentaje === p.config.porcentaje && actual?.minima === p.config.minima;
          return (
            <Chip
              key={p.nombre}
              compact
              selected={elegido}
              mode={elegido ? 'flat' : 'outlined'}
              onPress={() => onCambio(porcentajeATexto(p.config.porcentaje), p.config.minima ? centimosATexto(p.config.minima) : '')}
            >
              {p.nombre}
            </Chip>
          );
        })}
      </View>
      <View style={styles.fila}>
        <TextInput
          label="Porcentaje"
          value={porcentajeTexto}
          onChangeText={(t) => onCambio(t, minimaTexto)}
          keyboardType="decimal-pad"
          mode="outlined"
          dense
          style={styles.flex}
          right={<TextInput.Affix text="%" />}
        />
        <TextInput
          label="Mínimo"
          value={minimaTexto}
          onChangeText={(t) => onCambio(porcentajeTexto, t)}
          keyboardType="decimal-pad"
          mode="outlined"
          dense
          style={styles.flex}
          right={<TextInput.Affix text={INFO_MONEDA[moneda].corto} />}
        />
      </View>
      <HelperText type={actual ? 'info' : 'error'}>
        {actual
          ? `${describirComision(actual, formatear)}. Se propone sola al registrar gastos y transferencias desde aquí; tarifas máximas del BCV, tu banco puede cobrar menos.`
          : 'Revisa el porcentaje y el mínimo.'}
      </HelperText>
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fila: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
