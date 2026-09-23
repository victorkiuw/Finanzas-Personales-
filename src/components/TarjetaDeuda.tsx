import { StyleSheet, View } from 'react-native';
import { Card, ProgressBar, Text, useTheme } from 'react-native-paper';

import type { Deuda } from '../db/deudas';
import { cambioDe, type Tasas } from '../db/tasas';
import { NOMBRE_PAR, PARES, type ParDolar } from '../lib/api-tasas';
import { convertir } from '../lib/conversion';
import { fechaSimpleLegible, formatearFechaCorta } from '../lib/fechas';
import { formatearMonto } from '../lib/moneda';

export function vencida(d: Deuda, hoy = new Date()): boolean {
  if (!d.fecha_limite || d.cerrada) return false;
  const [a, m, dia] = d.fecha_limite.split('-').map(Number);
  return new Date(a, m - 1, dia, 23, 59) < hoy;
}

/** La deuda se prestó en bolívares pero se lleva en dólares: se paga en Bs. a la tasa del día. */
function enBolivaresAlDia(d: Deuda): boolean {
  return d.moneda === 'BS' && d.unidad !== 'BS';
}

/** Bs. que hay que pagar hoy por `monto` (en la unidad de la deuda) con la tasa indicada. */
function bolivaresHoy(monto: number, d: Deuda, tasas: Tasas, par: ParDolar): number | null {
  return convertir(monto, d.unidad, 'BS', cambioDe(tasas, par));
}

interface Props {
  deuda: Deuda;
  tasas: Tasas;
  referencia: ParDolar;
  /** Con la frase del préstamo original (pantalla de la deuda). */
  detalle?: boolean;
}

/**
 * Lo que se debe hoy, en palabras sencillas. Si se prestó en bolívares llevando
 * la cuenta en dólares, lo grande es cuántos bolívares hay que pagar hoy (con la
 * tasa elegida en Inicio) y debajo su valor en dólares.
 */
export function ResumenDeuda({ deuda: d, tasas, referencia, detalle = false }: Props) {
  const tema = useTheme();
  const suave = { color: tema.colors.onSurfaceVariant };
  const meDeben = d.tipo === 'ME_DEBEN';
  const alDia = enBolivaresAlDia(d);
  const pendienteBs = alDia ? bolivaresHoy(d.pendiente, d, tasas, referencia) : null;
  const otra = PARES.find((p) => p !== referencia)!;
  const pendienteOtra = alDia ? bolivaresHoy(d.pendiente, d, tasas, otra) : null;

  let titulo: string;
  if (d.cerrada || d.pendiente === 0) titulo = meDeben ? 'Ya te pagó todo' : 'Ya pagaste todo';
  else if (alDia) titulo = meDeben ? 'Te debe hoy' : 'Debes hoy';
  else titulo = meDeben ? 'Te debe' : 'Debes';

  return (
    <View style={styles.resumen}>
      <Text variant="labelLarge" style={suave}>
        {titulo}
      </Text>
      {d.pendiente > 0 && !d.cerrada && (
        <>
          <Text variant="headlineSmall" style={styles.cifra}>
            {pendienteBs !== null ? formatearMonto(pendienteBs, 'BS') : formatearMonto(d.pendiente, d.unidad)}
          </Text>
          {alDia && pendienteBs !== null && (
            <Text variant="bodyMedium">{`= ${formatearMonto(d.pendiente, d.unidad)} a tasa ${NOMBRE_PAR[referencia]} de hoy`}</Text>
          )}
          {alDia && pendienteBs === null && (
            <Text variant="bodySmall" style={suave}>
              Sin tasa del día para pasarlo a bolívares.
            </Text>
          )}
          {detalle && pendienteOtra !== null && (
            <Text variant="bodySmall" style={suave}>
              {`A tasa ${NOMBRE_PAR[otra]} serían ${formatearMonto(pendienteOtra, 'BS')}`}
            </Text>
          )}
        </>
      )}

      {d.pagado > 0 && (
        <>
          <ProgressBar progress={d.total > 0 ? Math.min(d.pagado / d.total, 1) : 0} style={styles.barra} />
          <Text variant="bodySmall" style={suave}>
            {`${meDeben ? 'Ya te pagó' : 'Ya pagaste'} ${formatearMonto(d.pagado, d.unidad)} de ${formatearMonto(d.total, d.unidad)}`}
          </Text>
        </>
      )}

      {detalle && (
        <Text variant="bodyMedium" style={styles.origen}>
          {`${meDeben ? 'Le prestaste' : 'Te prestó'} ${formatearMonto(d.monto, d.moneda)} el ${formatearFechaCorta(new Date(d.fecha))}`}
          {alDia ? ` (eso era ${formatearMonto(d.total, d.unidad)} ese día).` : '.'}
        </Text>
      )}
    </View>
  );
}

export function TarjetaDeuda({ deuda, tasas, referencia, onPress }: Omit<Props, 'detalle'> & { onPress: () => void }) {
  const tema = useTheme();
  const vence = deuda.fecha_limite && !deuda.cerrada;
  return (
    <Card mode="contained" onPress={onPress} style={[styles.tarjeta, deuda.cerrada && styles.cerrada]}>
      <Card.Title
        title={deuda.persona}
        subtitle={
          deuda.cerrada
            ? 'Saldada'
            : vence
              ? `${vencida(deuda) ? 'Venció' : 'Vence'} el ${fechaSimpleLegible(deuda.fecha_limite!)}`
              : undefined
        }
        subtitleStyle={vencida(deuda) ? { color: tema.colors.error } : undefined}
      />
      <Card.Content>
        <ResumenDeuda deuda={deuda} tasas={tasas} referencia={referencia} />
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  tarjeta: { marginHorizontal: 16, marginBottom: 12 },
  cerrada: { opacity: 0.6 },
  resumen: { gap: 4 },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  barra: { height: 6, borderRadius: 3, marginTop: 6 },
  origen: { marginTop: 8 },
});
