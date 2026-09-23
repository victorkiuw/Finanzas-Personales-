import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

import type { Billetera } from '../db/billeteras';
import { ultimaTasa } from '../db/movimientos';
import { NOMBRE_PAR, PARES } from '../lib/api-tasas';
import { esDolar, type Moneda } from '../lib/moneda';
import { formatearTasa, tasaATexto, tasaConMargen } from '../lib/tasa';
import { useTasas } from './TasasProvider';

interface Props {
  de: Moneda;
  a: Moneda;
  /** Billeteras que participan; las de bolívares con margen configurado sugieren "tasa del banco". */
  billeteras: (Billetera | null)[];
  onElegir: (tasaTexto: string) => void;
}

/**
 * Botones para llenar la tasa de un cambio de divisa: la última pactada entre
 * esas monedas, BCV, USDT, euro BCV y la del banco (BCV + su margen). Siempre editable.
 */
export function SugerenciasTasa({ de, a, billeteras, onElegir }: Props) {
  const db = useSQLiteContext();
  const { tasas } = useTasas();
  const [ultima, setUltima] = useState<number | null>(null);

  useEffect(() => {
    ultimaTasa(db, de, a).then(setUltima).catch(() => setUltima(null));
  }, [db, de, a]);

  const conBolivar = de === 'BS' || a === 'BS';
  const otra = de === 'BS' ? a : de;
  // Bolívares con dólares: BCV, USDT y banco. Bolívares con euros: euro BCV. Euros con dólares: euro/dólar BCV.
  const bolivarDolar = conBolivar && esDolar(otra);
  const bolivarEuro = conBolivar && otra === 'EUR';
  const euroDolar = (de === 'EUR' && esDolar(a)) || (a === 'EUR' && esDolar(de));
  const bcv = tasas.BCV?.tasa;
  const euro = tasas.EURO?.tasa;
  const bancos = bolivarDolar && bcv ? billeteras.filter((b): b is Billetera => !!b && b.moneda === 'BS' && b.margen_cambio !== null) : [];
  const opciones: { clave: string; texto: string; tasa: number; icono: string }[] = [];
  if (ultima) opciones.push({ clave: 'ultima', texto: `Última ${formatearTasa(ultima)}`, tasa: ultima, icono: 'history' });
  for (const b of bancos) {
    const t = tasaConMargen(bcv!, b.margen_cambio!);
    opciones.push({ clave: `banco-${b.id}`, texto: `${b.nombre} ${formatearTasa(t)}`, tasa: t, icono: 'bank' });
  }
  if (bolivarDolar) {
    for (const p of PARES) {
      const t = tasas[p]?.tasa;
      if (t) opciones.push({ clave: p, texto: `${NOMBRE_PAR[p]} ${formatearTasa(t)}`, tasa: t, icono: 'lightning-bolt' });
    }
  }
  if (bolivarEuro && euro) {
    opciones.push({ clave: 'EURO', texto: `${NOMBRE_PAR.EURO} ${formatearTasa(euro)}`, tasa: euro, icono: 'lightning-bolt' });
  }
  if (euroDolar && euro && bcv) {
    const t = Math.round((euro / bcv) * 10000) / 10000;
    opciones.push({ clave: 'EURO_USD', texto: `BCV ${formatearTasa(t)} $ por €`, tasa: t, icono: 'lightning-bolt' });
  }
  if (opciones.length === 0) return null;

  return (
    <View style={styles.chips}>
      {opciones.map((o) => (
        <Chip key={o.clave} compact icon={o.icono} onPress={() => onElegir(tasaATexto(o.tasa))}>
          {o.texto}
        </Chip>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
