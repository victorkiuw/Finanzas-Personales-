import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { formatearMonto, type Moneda } from '../lib/moneda';
import { COLOR_GASTO, COLOR_GASTO_OSCURO, COLOR_INGRESO, COLOR_INGRESO_OSCURO } from './ItemMovimiento';

/** Tarjetas de Ingresos y Egresos (y el balance debajo), al estilo de Rial y Money Manager. */
export function TarjetasFlujo({
  ingresos,
  gastos,
  moneda,
  conBalance = true,
}: {
  ingresos: number;
  gastos: number;
  moneda: Moneda;
  conBalance?: boolean;
}) {
  const tema = useTheme();
  const verde = tema.dark ? COLOR_INGRESO_OSCURO : COLOR_INGRESO;
  const rojo = tema.dark ? COLOR_GASTO_OSCURO : COLOR_GASTO;
  const balance = ingresos - gastos;
  return (
    <View style={styles.bloque}>
      <View style={styles.fila}>
        <Tarjeta titulo="Ingresos" valor={formatearMonto(ingresos, moneda)} icono="arrow-up" color="#22C55E" />
        <Tarjeta titulo="Egresos" valor={formatearMonto(gastos, moneda)} icono="arrow-down" color="#EF4444" />
      </View>
      {conBalance && (
        <View style={[styles.balance, { backgroundColor: tema.colors.surfaceVariant }]}>
          <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
            Balance
          </Text>
          <Text variant="titleMedium" style={[styles.cifra, { color: balance > 0 ? verde : balance < 0 ? rojo : tema.colors.onSurface }]}>
            {`${balance > 0 ? '+' : ''}${formatearMonto(balance, moneda)}`}
          </Text>
        </View>
      )}
    </View>
  );
}

function Tarjeta({ titulo, valor, icono, color }: { titulo: string; valor: string; icono: string; color: string }) {
  const tema = useTheme();
  return (
    <View style={[styles.tarjeta, { backgroundColor: tema.colors.surfaceVariant }]}>
      <View style={styles.encabezado}>
        <View style={[styles.circulo, { backgroundColor: color }]}>
          <Icon source={icono} size={18} color="#FFFFFF" />
        </View>
        <Text variant="titleSmall">{titulo}</Text>
      </View>
      <Text variant="titleLarge" style={styles.cifra} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: { gap: 8 },
  fila: { flexDirection: 'row', gap: 10 },
  tarjeta: { flex: 1, borderRadius: 24, padding: 16, gap: 10 },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  circulo: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  balance: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
});
