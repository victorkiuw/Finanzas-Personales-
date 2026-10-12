import { StyleSheet, View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';

import { nombreMes } from '../lib/fechas';

/** Pastilla "‹ Octubre 2026 ›" para moverse entre meses (no deja pasar del actual). */
export function SelectorMes({ mes, onCambio }: { mes: Date; onCambio: (mes: Date) => void }) {
  const tema = useTheme();
  const hoy = new Date();
  const esActual = mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth();
  const mover = (delta: number) => onCambio(new Date(mes.getFullYear(), mes.getMonth() + delta, 1));
  const fondoBoton = tema.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  return (
    <View style={[styles.pastilla, { backgroundColor: tema.colors.surfaceVariant }]}>
      <IconButton
        icon="chevron-left"
        containerColor={fondoBoton}
        onPress={() => mover(-1)}
        accessibilityLabel="Mes anterior"
        style={styles.boton}
      />
      <Text variant="titleMedium" style={styles.mes}>
        {nombreMes(mes)}
      </Text>
      <IconButton
        icon="chevron-right"
        containerColor={fondoBoton}
        onPress={() => mover(1)}
        disabled={esActual}
        accessibilityLabel="Mes siguiente"
        style={styles.boton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pastilla: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, padding: 4 },
  boton: { margin: 0 },
  mes: { flex: 1, textAlign: 'center', textTransform: 'capitalize', fontWeight: '600' },
});
