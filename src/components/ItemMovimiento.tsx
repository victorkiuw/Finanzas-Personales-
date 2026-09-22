import { StyleSheet, View } from 'react-native';
import { Avatar, Text, TouchableRipple, useTheme } from 'react-native-paper';

import { efectoEnBilletera, type Movimiento } from '../db/movimientos';
import { formatearHora } from '../lib/fechas';
import { formatearMonto } from '../lib/moneda';

export const COLOR_INGRESO = '#2E7D32';
export const COLOR_INGRESO_OSCURO = '#81C784';

interface Props {
  movimiento: Movimiento;
  /** Si se indica, el monto muestra el efecto sobre esta billetera. */
  billeteraId?: number;
  onPress: () => void;
}

function titulo(m: Movimiento): string {
  switch (m.tipo) {
    case 'TRANSFERENCIA':
      return `${m.origen_nombre} → ${m.destino_nombre}`;
    case 'APORTE_META':
      return 'Aporte a meta';
    case 'RETIRO_META':
      return 'Retiro de meta';
    default:
      return m.categoria_nombre ?? 'Sin categoría';
  }
}

export function ItemMovimiento({ movimiento: m, billeteraId, onPress }: Props) {
  const tema = useTheme();
  const verde = tema.dark ? COLOR_INGRESO_OSCURO : COLOR_INGRESO;
  const esTransferencia = m.tipo === 'TRANSFERENCIA';

  let montoTexto: string;
  let color = tema.colors.onSurface;
  let detalleMonto: string | null = null;
  if (billeteraId !== undefined) {
    const efecto = efectoEnBilletera(m, billeteraId);
    const moneda = m.billetera_destino_id === billeteraId && esTransferencia ? m.destino_moneda! : m.origen_moneda;
    montoTexto = `${efecto > 0 ? '+' : ''}${formatearMonto(efecto, moneda)}`;
    if (efecto > 0) color = verde;
  } else if (esTransferencia) {
    montoTexto = formatearMonto(m.monto, m.origen_moneda);
    if (m.destino_moneda !== m.origen_moneda) {
      detalleMonto = `→ ${formatearMonto(m.monto_destino ?? 0, m.destino_moneda!)}`;
    }
  } else {
    const entra = m.tipo === 'INGRESO' || m.tipo === 'RETIRO_META';
    montoTexto = `${entra ? '+' : '-'}${formatearMonto(m.monto, m.origen_moneda)}`;
    if (entra) color = verde;
  }

  const subtitulo = [
    esTransferencia ? 'Transferencia' : m.origen_nombre,
    formatearHora(m.fecha),
    m.nota,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableRipple onPress={onPress} accessibilityRole="button">
      <View style={styles.fila}>
        <Avatar.Icon
          size={40}
          icon={esTransferencia ? 'swap-horizontal' : (m.categoria_icono ?? 'piggy-bank')}
          color="#FFFFFF"
          style={{ backgroundColor: esTransferencia ? tema.colors.secondary : (m.categoria_color ?? tema.colors.tertiary) }}
        />
        <View style={styles.textos}>
          <Text variant="bodyLarge" numberOfLines={1}>
            {titulo(m)}
          </Text>
          <Text variant="bodySmall" numberOfLines={1} style={{ color: tema.colors.onSurfaceVariant }}>
            {subtitulo}
          </Text>
        </View>
        <View style={styles.montos}>
          <Text variant="bodyLarge" style={[styles.monto, { color }]}>
            {montoTexto}
          </Text>
          {detalleMonto && (
            <Text variant="bodySmall" style={[styles.monto, { color: tema.colors.onSurfaceVariant }]}>
              {detalleMonto}
            </Text>
          )}
        </View>
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  textos: { flex: 1 },
  montos: { alignItems: 'flex-end' },
  monto: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});
