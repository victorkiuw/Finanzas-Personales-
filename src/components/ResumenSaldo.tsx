import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';

import { totalesPorMoneda, type Billetera } from '../db/billeteras';
import type { Meta } from '../db/metas';
import { NOMBRE_PAR, PARES } from '../lib/api-tasas';
import { totalConsolidado } from '../lib/conversion';
import { formatearMonto, INFO_MONEDA, MONEDAS, type Moneda } from '../lib/moneda';
import { useTasas } from './TasasProvider';

const BASES: Moneda[] = ['USD', 'BS'];

/** Colores fijos de los selectores sobre el verde: el elegido oscuro y un poco más pequeño, los demás claros. */
const SELECTOR = {
  elegido: { fondo: '#0B3A26', texto: '#FFFFFF', borde: '#0B3A26' },
  libre: { fondo: '#E3F6EC', texto: '#0B3A26', borde: '#9CCFB3' },
};

function Opcion({ texto, elegida, onPress }: { texto: string; elegida: boolean; onPress: () => void }) {
  const c = elegida ? SELECTOR.elegido : SELECTOR.libre;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: elegida }}
      style={[styles.opcion, { backgroundColor: c.fondo, borderColor: c.borde }, elegida && styles.elegida]}
    >
      <Text variant="labelLarge" style={{ color: c.texto, fontWeight: elegida ? '700' : '500' }}>
        {texto}
      </Text>
    </Pressable>
  );
}

/**
 * Dinero disponible: las billeteras que cuentan en el total, en la moneda base
 * elegida y convertido con la tasa de referencia. Lo ahorrado en metas y las
 * billeteras "guardadas aparte" se muestran por separado, sin sumarse.
 */
export function ResumenSaldo({ billeteras, metas = [] }: { billeteras: Billetera[]; metas?: Meta[] }) {
  const tema = useTheme();
  const { cambio, referencia, cambiarReferencia, monedaBase, cambiarMonedaBase } = useTasas();
  const [verAparte, setVerAparte] = useState(false);
  const color = tema.colors.onPrimaryContainer;

  const activas = billeteras.filter((b) => !b.archivada);
  const cuentan = activas.filter((b) => b.en_total);
  const aparte = activas.filter((b) => !b.en_total);
  const ahorrado = metas.filter((m) => !m.archivada && m.saldo !== 0);

  const totales = totalesPorMoneda(cuentan);
  const monedas = MONEDAS.filter((m) => totales[m] !== undefined);
  const total = totalConsolidado(cuentan, monedaBase, cambio);
  const totalMetas = ahorrado.length ? totalConsolidado(ahorrado, monedaBase, cambio) : null;
  const totalAparte = aparte.length ? totalConsolidado(aparte, monedaBase, cambio) : null;
  const faltaEuro = cambio.dolar !== null && cambio.euro === null;

  return (
    <Card mode="contained" style={[styles.tarjeta, { backgroundColor: tema.colors.primaryContainer }]}>
      <Card.Content style={styles.contenido}>
        <Text variant="labelLarge" style={{ color }}>
          Disponible
        </Text>
        <Text variant="headlineMedium" style={[styles.total, { color }]}>
          {total !== null ? `≈ ${formatearMonto(total, monedaBase)}` : '—'}
        </Text>
        {total === null && (
          <Text variant="bodySmall" style={{ color }}>
            {faltaEuro
              ? 'Falta la tasa del euro. Conéctate a internet o escríbela en la pestaña Tasas.'
              : `No hay tasa ${NOMBRE_PAR[referencia]} guardada. Conéctate a internet o escríbela en la pestaña Tasas.`}
          </Text>
        )}

        <View style={styles.chips}>
          {BASES.map((m) => (
            <Opcion key={m} texto={INFO_MONEDA[m].corto} elegida={monedaBase === m} onPress={() => cambiarMonedaBase(m)} />
          ))}
          <View style={styles.separador} />
          {PARES.map((p) => (
            <Opcion key={p} texto={NOMBRE_PAR[p]} elegida={referencia === p} onPress={() => cambiarReferencia(p)} />
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

        {(ahorrado.length > 0 || aparte.length > 0) && (
          <View style={[styles.aparte, { borderTopColor: tema.colors.outlineVariant }]}>
            {ahorrado.length > 0 && (
              <Text variant="bodyMedium" style={[styles.linea, { color }]}>
                {`Ahorrado en metas: ${totalMetas !== null ? `≈ ${formatearMonto(totalMetas, monedaBase)}` : '—'}`}
              </Text>
            )}
            {aparte.length > 0 && (
              <Pressable onPress={() => setVerAparte((v) => !v)} accessibilityRole="button" hitSlop={8}>
                <Text variant="bodyMedium" style={[styles.linea, { color }]}>
                  {`Guardado aparte: ${
                    !verAparte ? '•••••' : totalAparte !== null ? `≈ ${formatearMonto(totalAparte, monedaBase)}` : '—'
                  }  `}
                  <Text variant="bodySmall" style={{ color, textDecorationLine: 'underline' }}>
                    {verAparte ? 'ocultar' : 'ver'}
                  </Text>
                </Text>
              </Pressable>
            )}
            <Text variant="bodySmall" style={{ color, opacity: 0.8 }}>
              No se suman a lo disponible.
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  tarjeta: { marginHorizontal: 16, marginBottom: 8 },
  contenido: { gap: 4 },
  total: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' },
  opcion: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1, minHeight: 36, justifyContent: 'center' },
  elegida: { transform: [{ scale: 0.9 }] },
  separador: { width: 4 },
  desglose: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
  linea: { fontVariant: ['tabular-nums'] },
  aparte: { marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
});
