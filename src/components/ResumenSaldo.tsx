import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, IconButton, Text, useTheme } from 'react-native-paper';

import { totalesPorMoneda, type Billetera } from '../db/billeteras';
import { ajenoPorBilletera, type Deuda } from '../db/deudas';
import type { Meta } from '../db/metas';
import { NOMBRE_PAR } from '../lib/api-tasas';
import { totalConsolidado } from '../lib/conversion';
import { formatearMonto, MONEDAS } from '../lib/moneda';
import { formatearTasa } from '../lib/tasa';
import { coloresExtra } from '../lib/tema';
import { COLOR_GASTO_OSCURO, COLOR_INGRESO_OSCURO, COLOR_GASTO, COLOR_INGRESO } from './ItemMovimiento';
import { useModoDiscreto } from './ModoDiscreto';
import { NumeroAnimado } from './NumeroAnimado';
import { vibrar } from '../lib/vibrar';
import { useTasas, VISTAS, type Vista } from './TasasProvider';

const NOMBRE_VISTA: Record<Vista, string> = { BS: 'Bs.', USD: 'USD', USDT: 'USDT', EUR: 'EUR' };

/** Selector en forma de pastilla: la elegida en lima, las demás en gris. */
export function Pastilla({ texto, elegida, onPress }: { texto: string; elegida: boolean; onPress: () => void }) {
  const tema = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: elegida }}
      style={[
        styles.pastilla,
        { backgroundColor: elegida ? tema.colors.primaryContainer : tema.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
      ]}
    >
      <Text
        variant="labelLarge"
        style={{ color: elegida ? tema.colors.onPrimaryContainer : tema.colors.onSurface, fontWeight: elegida ? '700' : '500' }}
      >
        {texto}
      </Text>
    </Pressable>
  );
}

/**
 * Dinero disponible: las billeteras que cuentan en el total, en la moneda
 * elegida (Bs., USD a tasa BCV, USDT a tasa USDT o euros). Lo ahorrado en
 * metas, las billeteras "guardadas aparte" y el dinero de otras personas se
 * muestran por separado, sin sumarse.
 */
export function ResumenSaldo({
  billeteras,
  metas = [],
  deudas = [],
  anterior,
}: {
  billeteras: Billetera[];
  metas?: Meta[];
  /** Para restar el dinero de otros (solo se usan las ajenas). */
  deudas?: Deuda[];
  /** Disponible al cierre del mes pasado, en la misma moneda, para comparar. */
  anterior?: number | null;
}) {
  const tema = useTheme();
  const extra = coloresExtra(tema);
  const { cambio, referencia, monedaBase, vista, cambiarVista, tasas } = useTasas();
  const { discreto, alternar } = useModoDiscreto();
  const [verAparte, setVerAparte] = useState(false);
  // Doble toque sobre el total: oculta o muestra los montos.
  const ultimoToque = useRef(0);
  const tocarTotal = () => {
    const ahora = Date.now();
    if (ahora - ultimoToque.current < 320) {
      vibrar('media');
      alternar();
      ultimoToque.current = 0;
    } else ultimoToque.current = ahora;
  };
  const color = extra.heroeTexto;
  const suave = { color, opacity: 0.75 };

  const activas = billeteras.filter((b) => !b.archivada);
  const ajenoPor = ajenoPorBilletera(deudas);
  // Lo que es mío de cada billetera que cuenta.
  const cuentan = activas.filter((b) => b.en_total).map((b) => ({ ...b, saldo: b.saldo - (ajenoPor.get(b.id) ?? 0) }));
  const deOtros = activas.filter((b) => b.en_total && ajenoPor.has(b.id)).map((b) => ({ moneda: b.moneda, saldo: ajenoPor.get(b.id)! }));
  const aparte = activas.filter((b) => !b.en_total);
  const ahorrado = metas.filter((m) => !m.archivada && m.saldo !== 0);

  const totales = totalesPorMoneda(cuentan);
  const monedas = MONEDAS.filter((m) => totales[m] !== undefined && totales[m] !== 0);
  const total = totalConsolidado(cuentan, monedaBase, cambio);
  const totalDeOtros = deOtros.length ? totalConsolidado(deOtros, monedaBase, cambio) : null;
  const totalMetas = ahorrado.length ? totalConsolidado(ahorrado, monedaBase, cambio) : null;
  const totalAparte = aparte.length ? totalConsolidado(aparte, monedaBase, cambio) : null;
  const faltaEuro = cambio.dolar !== null && cambio.euro === null;
  const diferencia = total !== null && anterior !== null && anterior !== undefined ? total - anterior : null;
  const verde = tema.dark ? COLOR_INGRESO_OSCURO : COLOR_INGRESO;
  const rojo = tema.dark ? COLOR_GASTO_OSCURO : COLOR_GASTO;

  // La tasa que se está usando, como en Rial: "Bs. 876,80 / $".
  const tasaDolar = tasas[referencia]?.tasa;
  const lineaTasa =
    vista === 'EUR'
      ? tasas.EURO
        ? `Bs. ${formatearTasa(tasas.EURO.tasa)} / €`
        : null
      : tasaDolar
        ? `Bs. ${formatearTasa(tasaDolar)} / ${vista === 'USDT' ? 'USDT' : '$'} · tasa ${NOMBRE_PAR[referencia]}`
        : null;

  return (
    <View style={[styles.heroe, { backgroundColor: extra.heroe }]}>
      <View style={styles.titulo}>
        <Text variant="titleSmall" style={suave}>
          Disponible
        </Text>
        <IconButton
          icon={discreto ? 'eye-off-outline' : 'eye-outline'}
          size={18}
          iconColor={color}
          style={styles.ojo}
          accessibilityLabel={discreto ? 'Mostrar montos' : 'Ocultar todos los montos'}
          onPress={alternar}
        />
      </View>
      <Pressable onPress={tocarTotal} accessibilityLabel="Toca dos veces para ocultar o mostrar los montos">
        {total !== null ? (
          <NumeroAnimado
            key={monedaBase}
            valor={total}
            formatear={(v) => formatearMonto(v, monedaBase)}
            variant="displaySmall"
            style={[styles.total, { color }]}
          />
        ) : (
          <Text variant="displaySmall" style={[styles.total, { color }]}>
            —
          </Text>
        )}
      </Pressable>
      {total === null && (
        <Text variant="bodySmall" style={[suave, styles.centrado]}>
          {faltaEuro
            ? 'Falta la tasa del euro. Conéctate a internet o escríbela en la pestaña Tasas.'
            : `No hay tasa ${NOMBRE_PAR[referencia]} guardada. Conéctate a internet o escríbela en la pestaña Tasas.`}
        </Text>
      )}
      {diferencia !== null && !discreto && (
        <View style={styles.comparacion}>
          <Icon source={diferencia >= 0 ? 'arrow-up' : 'arrow-down'} size={16} color={diferencia >= 0 ? verde : rojo} />
          <Text variant="bodyMedium" style={{ color: diferencia >= 0 ? verde : rojo, fontWeight: '600' }}>
            {`${formatearMonto(Math.abs(diferencia), monedaBase)} vs mes pasado`}
          </Text>
        </View>
      )}
      {lineaTasa && (
        <Text variant="bodySmall" style={suave}>
          {lineaTasa}
        </Text>
      )}

      <View style={styles.pastillas}>
        {VISTAS.map((v) => (
          <Pastilla key={v} texto={NOMBRE_VISTA[v]} elegida={vista === v} onPress={() => cambiarVista(v)} />
        ))}
      </View>

      {(monedas.length > 1 || (monedas.length === 1 && monedas[0] !== monedaBase)) && (
        <Text variant="bodySmall" style={[suave, styles.centrado]}>
          {monedas.map((m) => formatearMonto(totales[m]!, m)).join('  ·  ')}
        </Text>
      )}

      {(ahorrado.length > 0 || aparte.length > 0 || deOtros.length > 0) && (
        <View style={[styles.aparte, { borderTopColor: tema.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }]}>
          {ahorrado.length > 0 && (
            <Text variant="bodySmall" style={[suave, styles.centrado]}>
              {`Ahorrado en metas: ${totalMetas !== null ? `≈ ${formatearMonto(totalMetas, monedaBase)}` : '—'}`}
            </Text>
          )}
          {deOtros.length > 0 && (
            <Text variant="bodySmall" style={[suave, styles.centrado]}>
              {`De otras personas: ${totalDeOtros !== null ? `≈ ${formatearMonto(totalDeOtros, monedaBase)}` : '—'}`}
            </Text>
          )}
          {aparte.length > 0 && (
            <Pressable onPress={() => setVerAparte((v) => !v)} accessibilityRole="button" hitSlop={8}>
              <Text variant="bodySmall" style={[suave, styles.centrado]}>
                {`Guardado aparte: ${
                  !verAparte ? '•••••' : totalAparte !== null ? `≈ ${formatearMonto(totalAparte, monedaBase)}` : '—'
                }  `}
                <Text variant="bodySmall" style={{ color, textDecorationLine: 'underline' }}>
                  {verAparte ? 'ocultar' : 'ver'}
                </Text>
              </Text>
            </Pressable>
          )}
          <Text variant="bodySmall" style={[suave, styles.centrado, { opacity: 0.55 }]}>
            No se suman a lo disponible.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heroe: { marginHorizontal: 16, marginBottom: 4, borderRadius: 28, paddingVertical: 20, paddingHorizontal: 16, alignItems: 'center', gap: 6 },
  titulo: { flexDirection: 'row', alignItems: 'center' },
  ojo: { margin: 0 },
  total: { fontVariant: ['tabular-nums'], fontWeight: '800' },
  centrado: { textAlign: 'center' },
  comparacion: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pastillas: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 },
  pastilla: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, minHeight: 36, justifyContent: 'center' },
  aparte: { alignSelf: 'stretch', marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
});
