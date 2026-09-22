import { StyleSheet, View } from 'react-native';
import { Avatar, Icon, Text, useTheme } from 'react-native-paper';

import type { EstadoPresupuesto } from '../db/presupuestos';
import { formatearMonto } from '../lib/moneda';

// Colores de estado con icono y texto (nunca solo color).
const AMBAR_CLARO = '#B26A00';
const AMBAR_OSCURO = '#FFB74D';

/** Progreso de cada presupuesto del mes: gastado / límite, con aviso al 80 % y al pasarse. */
export function BarrasPresupuesto({ estados }: { estados: EstadoPresupuesto[] }) {
  const tema = useTheme();
  return (
    <View style={styles.lista}>
      {estados.map((e) => {
        const color =
          e.estado === 'excedido' ? tema.colors.error : e.estado === 'alerta' ? (tema.dark ? AMBAR_OSCURO : AMBAR_CLARO) : tema.colors.primary;
        const resto = e.monto - e.gastado;
        return (
          <View key={e.categoria_id} style={styles.fila}>
            <Avatar.Icon size={32} icon={e.icono} color="#FFFFFF" style={{ backgroundColor: e.color }} />
            <View style={styles.flex}>
              <View style={styles.textos}>
                <Text variant="bodyMedium" numberOfLines={1} style={styles.flex}>
                  {e.nombre}
                </Text>
                <Text variant="bodySmall" style={styles.cifra}>
                  {`${formatearMonto(e.gastado, e.moneda)} / ${formatearMonto(e.monto, e.moneda)}`}
                </Text>
              </View>
              <View style={[styles.pista, { backgroundColor: tema.colors.surfaceVariant }]}>
                <View style={[styles.relleno, { width: `${Math.min(e.fraccion, 1) * 100}%`, backgroundColor: color }]} />
              </View>
              <View style={styles.estado}>
                {e.estado !== 'ok' && <Icon source={e.estado === 'excedido' ? 'alert-circle' : 'alert'} size={14} color={color} />}
                <Text variant="bodySmall" style={{ color: e.estado === 'ok' ? tema.colors.onSurfaceVariant : color }}>
                  {e.estado === 'excedido'
                    ? `Te pasaste por ${formatearMonto(-resto, e.moneda)}`
                    : `Quedan ${formatearMonto(resto, e.moneda)} (${Math.round(e.fraccion * 100)} % usado)`}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lista: { gap: 14 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  cifra: { fontVariant: ['tabular-nums'] },
  pista: { height: 8, borderRadius: 4, overflow: 'hidden' },
  relleno: { height: 8, borderRadius: 4 },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
});
