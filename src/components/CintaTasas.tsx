import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Text, TouchableRipple, useTheme } from 'react-native-paper';

import { NOMBRE_PAR, PARES } from '../lib/api-tasas';
import { haceCuanto } from '../lib/fechas';
import { formatearTasa } from '../lib/tasa';
import { useTasas } from './TasasProvider';

/** Resumen compacto de las tasas activas; al tocarlo abre la pestaña de tasas. */
export function CintaTasas() {
  const tema = useTheme();
  const { tasas, actualizando, error } = useTasas();
  const consultadas = PARES.map((p) => tasas[p]?.consultada_en).filter((f): f is string => !!f);
  const masVieja = consultadas.sort()[0];

  let estado: string;
  if (actualizando) estado = 'Actualizando…';
  else if (!masVieja) estado = error ? `Sin tasas: ${error}` : 'Sin tasas todavía';
  else estado = `${error ? 'Sin conexión · ' : ''}Actualizado ${haceCuanto(masVieja)}`;

  return (
    <TouchableRipple onPress={() => router.navigate('/tasas')} accessibilityRole="button" style={styles.cinta}>
      <View style={styles.fila}>
        <Icon source={error ? 'cloud-off-outline' : 'swap-vertical-circle-outline'} size={18} color={tema.colors.onSurfaceVariant} />
        <View style={styles.flex}>
          <Text variant="labelLarge">
            {PARES.map((p) => `${NOMBRE_PAR[p]} ${tasas[p] ? formatearTasa(tasas[p].tasa) : '—'}`).join('   ·   ')}
          </Text>
          <Text variant="bodySmall" style={{ color: error ? tema.colors.error : tema.colors.onSurfaceVariant }}>
            {estado}
          </Text>
        </View>
        {actualizando && <ActivityIndicator size={16} />}
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  cinta: { marginHorizontal: 16, marginBottom: 8, borderRadius: 12 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 4 },
  flex: { flex: 1 },
});
