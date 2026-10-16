import { StyleSheet, View } from 'react-native';
import { Card, ProgressBar, Text, useTheme } from 'react-native-paper';

import type { Meta } from '../db/metas';
import { fechaSimpleLegible, mesesHasta } from '../lib/fechas';
import { formatearMonto } from '../lib/moneda';

export function ResumenMeta({ meta }: { meta: Meta }) {
  const tema = useTheme();
  const progreso = Math.min(Math.max(meta.saldo / meta.monto_objetivo, 0), 1);
  const falta = Math.max(meta.monto_objetivo - meta.saldo, 0);
  const cumplida = falta === 0;
  let ritmo: string | null = null;
  if (meta.fecha_objetivo && !cumplida) {
    const meses = mesesHasta(meta.fecha_objetivo);
    ritmo = `Para el ${fechaSimpleLegible(meta.fecha_objetivo)}: ahorra ${formatearMonto(Math.ceil(falta / meses), meta.moneda)} al mes`;
  }

  return (
    <View style={styles.resumen}>
      <View style={styles.fila}>
        <Text variant="titleLarge" style={styles.cifra}>
          {formatearMonto(meta.saldo, meta.moneda)}
        </Text>
        <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
          {`de ${formatearMonto(meta.monto_objetivo, meta.moneda)}`}
        </Text>
      </View>
      <ProgressBar progress={progreso} color={meta.color_hex} style={styles.barra} />
      <View style={styles.fila}>
        <Text variant="labelLarge">{`${Math.floor(progreso * 100)}%`}</Text>
        <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
          {cumplida ? '¡Meta cumplida! 🎉' : `Faltan ${formatearMonto(falta, meta.moneda)}`}
        </Text>
      </View>
      {ritmo && (
        <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
          {ritmo}
        </Text>
      )}
    </View>
  );
}

export function TarjetaMeta({ meta, onPress }: { meta: Meta; onPress: () => void }) {
  return (
    <Card mode="contained" onPress={onPress} style={[styles.tarjeta, meta.archivada && styles.archivada]}>
      <Card.Title
        title={meta.nombre}
        subtitle={meta.archivada ? 'Archivada' : undefined}
        left={() => <View style={[styles.punto, { backgroundColor: meta.color_hex }]} />}
        leftStyle={styles.izquierda}
      />
      <Card.Content>
        <ResumenMeta meta={meta} />
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  tarjeta: { marginHorizontal: 16, marginBottom: 12 },
  archivada: { opacity: 0.6 },
  izquierda: { width: 16, marginRight: 8 },
  punto: { width: 14, height: 14, borderRadius: 7 },
  resumen: { gap: 6 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  barra: { height: 10, borderRadius: 5 },
});
