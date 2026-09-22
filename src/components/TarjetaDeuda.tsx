import { StyleSheet, View } from 'react-native';
import { Card, Chip, ProgressBar, Text, useTheme } from 'react-native-paper';

import type { Deuda } from '../db/deudas';
import type { Tasas } from '../db/tasas';
import { NOMBRE_PAR, PARES } from '../lib/api-tasas';
import { convertir } from '../lib/conversion';
import { fechaSimpleLegible } from '../lib/fechas';
import { formatearMonto } from '../lib/moneda';

/** "Hoy son Bs. X (paralelo) · Bs. Y (BCV)" para una deuda en dólares. */
export function equivalenteHoy(montoUsd: number, tasas: Tasas): string | null {
  const partes = PARES.filter((p) => tasas[p]).map(
    (p) => `${formatearMonto(convertir(montoUsd, 'USD', 'BS', tasas[p]!.tasa), 'BS')} (${NOMBRE_PAR[p]})`,
  );
  return partes.length ? partes.join(' · ') : null;
}

export function vencida(d: Deuda, hoy = new Date()): boolean {
  if (!d.fecha_limite || d.cerrada) return false;
  const [a, m, dia] = d.fecha_limite.split('-').map(Number);
  return new Date(a, m - 1, dia, 23, 59) < hoy;
}

/** Progreso, pendiente y equivalente de hoy en bolívares si la deuda está en dólares. */
export function ResumenDeuda({ deuda, tasas }: { deuda: Deuda; tasas: Tasas }) {
  const tema = useTheme();
  const progreso = deuda.total > 0 ? Math.min(deuda.pagado / deuda.total, 1) : 0;
  const hoy = deuda.unidad !== 'BS' && deuda.pendiente > 0 && deuda.moneda === 'BS' ? equivalenteHoy(deuda.pendiente, tasas) : null;
  return (
    <View style={styles.resumen}>
      <View style={styles.fila}>
        <Text variant="titleLarge" style={styles.cifra}>
          {formatearMonto(deuda.pendiente, deuda.unidad)}
        </Text>
        <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
          {`de ${formatearMonto(deuda.total, deuda.unidad)}`}
        </Text>
      </View>
      <ProgressBar progress={progreso} style={styles.barra} />
      {hoy && (
        <Text variant="bodyMedium">
          <Text variant="labelLarge">Hoy: </Text>
          {hoy}
        </Text>
      )}
      {deuda.tasa_referencia && (
        <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
          {`Prestado: ${formatearMonto(deuda.monto, deuda.moneda)} a ${String(deuda.tasa_referencia).replace('.', ',')} Bs./USD`}
        </Text>
      )}
    </View>
  );
}

export function TarjetaDeuda({ deuda, tasas, onPress }: { deuda: Deuda; tasas: Tasas; onPress: () => void }) {
  const tema = useTheme();
  const meDeben = deuda.tipo === 'ME_DEBEN';
  return (
    <Card mode="contained" onPress={onPress} style={[styles.tarjeta, deuda.cerrada && styles.cerrada]}>
      <Card.Title
        title={deuda.persona}
        subtitle={
          deuda.cerrada
            ? 'Saldada'
            : deuda.fecha_limite
              ? `${vencida(deuda) ? 'Vencida' : 'Vence'} el ${fechaSimpleLegible(deuda.fecha_limite)}`
              : undefined
        }
        subtitleStyle={vencida(deuda) ? { color: tema.colors.error } : undefined}
        right={() => (
          <Chip compact style={styles.chip} icon={meDeben ? 'arrow-bottom-left' : 'arrow-top-right'}>
            {meDeben ? 'Me debe' : 'Le debo'}
          </Chip>
        )}
      />
      <Card.Content>
        <ResumenDeuda deuda={deuda} tasas={tasas} />
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  tarjeta: { marginHorizontal: 16, marginBottom: 12 },
  cerrada: { opacity: 0.6 },
  chip: { marginRight: 12 },
  resumen: { gap: 6 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  barra: { height: 8, borderRadius: 4 },
});
