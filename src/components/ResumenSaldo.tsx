import { StyleSheet, View } from 'react-native';
import { Card, Chip, Text, useTheme } from 'react-native-paper';

import type { Billetera } from '../db/billeteras';
import { totalesPorMoneda } from '../db/billeteras';
import { NOMBRE_PAR, PARES } from '../lib/api-tasas';
import { totalConsolidado } from '../lib/conversion';
import { formatearMonto, INFO_MONEDA, MONEDAS, type Moneda } from '../lib/moneda';
import { formatearTasa } from '../lib/tasa';
import { useTasas } from './TasasProvider';

const BASES: Moneda[] = ['USD', 'BS'];

/** Patrimonio total en la moneda base elegida, convertido con la tasa de referencia. */
export function ResumenSaldo({ billeteras }: { billeteras: Billetera[] }) {
  const tema = useTheme();
  const { tasas, referencia, cambiarReferencia, monedaBase, cambiarMonedaBase } = useTasas();
  const color = tema.colors.onPrimaryContainer;
  const totales = totalesPorMoneda(billeteras);
  const monedas = MONEDAS.filter((m) => totales[m] !== undefined);
  const tasa = tasas[referencia]?.tasa;
  // Sin bolívares de por medio no hace falta tasa (USD y USDT van 1:1).
  const necesitaTasa = monedaBase === 'BS' || monedas.includes('BS');
  const total = !necesitaTasa || tasa ? totalConsolidado(billeteras, monedaBase, tasa ?? 1) : null;

  return (
    <Card mode="contained" style={[styles.tarjeta, { backgroundColor: tema.colors.primaryContainer }]}>
      <Card.Content style={styles.contenido}>
        <Text variant="labelLarge" style={{ color }}>
          Patrimonio total
        </Text>
        <Text variant="headlineMedium" style={[styles.total, { color }]}>
          {total !== null ? `≈ ${formatearMonto(total, monedaBase)}` : '—'}
        </Text>
        {total === null && (
          <Text variant="bodySmall" style={{ color }}>
            {`No hay tasa ${NOMBRE_PAR[referencia]} guardada. Conéctate a internet o escríbela en la pestaña Tasas.`}
          </Text>
        )}

        <View style={styles.chips}>
          {BASES.map((m) => (
            <Chip
              key={m}
              compact
              selected={monedaBase === m}
              showSelectedCheck={false}
              mode={monedaBase === m ? 'flat' : 'outlined'}
              onPress={() => cambiarMonedaBase(m)}
            >
              {INFO_MONEDA[m].corto}
            </Chip>
          ))}
          <View style={styles.separador} />
          {PARES.map((p) => (
            <Chip
              key={p}
              compact
              selected={referencia === p}
              showSelectedCheck={false}
              mode={referencia === p ? 'flat' : 'outlined'}
              onPress={() => cambiarReferencia(p)}
            >
              {tasas[p] ? `${NOMBRE_PAR[p]} ${formatearTasa(tasas[p].tasa)}` : NOMBRE_PAR[p]}
            </Chip>
          ))}
        </View>

        {monedas.length > 1 || (monedas.length === 1 && monedas[0] !== monedaBase) ? (
          <View style={styles.desglose}>
            {monedas.map((m) => (
              <Text key={m} variant="bodyMedium" style={[styles.linea, { color }]}>
                {formatearMonto(totales[m]!, m)}
              </Text>
            ))}
          </View>
        ) : null}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  tarjeta: { marginHorizontal: 16, marginBottom: 8 },
  contenido: { gap: 4 },
  total: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' },
  separador: { width: 4 },
  desglose: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
  linea: { fontVariant: ['tabular-nums'] },
});
