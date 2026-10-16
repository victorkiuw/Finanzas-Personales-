import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';

import { efectoEnBilletera, TIPOS_DEUDA, TIPOS_ENTRADA, type Movimiento } from '../db/movimientos';
import { formatearHora } from '../lib/fechas';
import { formatearMonto } from '../lib/moneda';
import { IconoCuadro } from './IconoCuadro';

export const COLOR_INGRESO = '#2E7D32';
export const COLOR_INGRESO_OSCURO = '#4ADE80';
export const COLOR_GASTO = '#C62828';
export const COLOR_GASTO_OSCURO = '#F87171';

interface Props {
  movimiento: Movimiento;
  /** Si se indica, el monto muestra el efecto sobre esta billetera. */
  billeteraId?: number;
  /** Si se indica, el monto se muestra en la moneda de la meta (lista de una meta). */
  enMeta?: boolean;
  onPress: () => void;
}

function titulo(m: Movimiento): string {
  switch (m.tipo) {
    case 'TRANSFERENCIA':
      return `${m.origen_nombre} → ${m.destino_nombre}`;
    case 'APORTE_META':
      return `Aporte a ${m.meta_nombre ?? 'meta'}`;
    case 'RETIRO_META':
      return `Retiro de ${m.meta_nombre ?? 'meta'}`;
    case 'PRESTAMO_DADO':
      return `Préstamo a ${m.deuda_persona ?? '…'}`;
    case 'PRESTAMO_RECIBIDO':
      if (m.deuda_ajeno) return `Entró para ${m.deuda_persona ?? '…'}`;
      return `Préstamo de ${m.deuda_persona ?? '…'}`;
    case 'COBRO_DEUDA':
      return `Te pagó ${m.deuda_persona ?? '…'}`;
    case 'PAGO_DEUDA':
      if (m.deuda_ajeno) return `Salió de lo de ${m.deuda_persona ?? '…'}`;
      return `Pago a ${m.deuda_persona ?? '…'}`;
    default:
      return m.categoria_nombre ?? 'Sin categoría';
  }
}

export function ItemMovimiento({ movimiento: m, billeteraId, enMeta, onPress }: Props) {
  const tema = useTheme();
  const verde = tema.dark ? COLOR_INGRESO_OSCURO : COLOR_INGRESO;
  const rojo = tema.dark ? COLOR_GASTO_OSCURO : COLOR_GASTO;
  const esTransferencia = m.tipo === 'TRANSFERENCIA';

  let montoTexto: string;
  let color = tema.colors.onSurface;
  let detalleMonto: string | null = null;
  if (enMeta && m.meta_moneda) {
    const entra = m.tipo === 'APORTE_META';
    montoTexto = `${entra ? '+' : '-'}${formatearMonto(m.monto_destino ?? 0, m.meta_moneda)}`;
    color = entra ? verde : rojo;
  } else if (billeteraId !== undefined) {
    const efecto = efectoEnBilletera(m, billeteraId);
    const moneda = m.billetera_destino_id === billeteraId && esTransferencia ? m.destino_moneda! : m.origen_moneda;
    montoTexto = `${efecto > 0 ? '+' : ''}${formatearMonto(efecto, moneda)}`;
    color = efecto > 0 ? verde : efecto < 0 ? rojo : color;
  } else if (esTransferencia) {
    montoTexto = formatearMonto(m.monto, m.origen_moneda);
    if (m.destino_moneda !== m.origen_moneda) {
      detalleMonto = `→ ${formatearMonto(m.monto_destino ?? 0, m.destino_moneda!)}`;
    }
  } else {
    const entra = TIPOS_ENTRADA.includes(m.tipo);
    montoTexto = `${entra ? '+' : '-'}${formatearMonto(m.monto, m.origen_moneda)}`;
    color = entra ? verde : rojo;
  }

  const subtitulo = [
    esTransferencia ? 'Transferencia' : m.origen_nombre,
    formatearHora(m.fecha),
    m.nota,
    m.comprobante ? '📎' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableRipple onPress={onPress} accessibilityRole="button">
      <View style={styles.fila}>
        <IconoCuadro
          icono={esTransferencia ? 'swap-horizontal' : TIPOS_DEUDA.includes(m.tipo) ? 'handshake' : (m.categoria_icono ?? 'piggy-bank')}
          color={esTransferencia ? '#60A5FA' : TIPOS_DEUDA.includes(m.tipo) ? '#F59E0B' : (m.categoria_color ?? '#9CA3AF')}
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
  fila: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  textos: { flex: 1 },
  montos: { alignItems: 'flex-end' },
  monto: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});
