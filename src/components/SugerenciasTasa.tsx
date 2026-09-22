import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

import type { Billetera } from '../db/billeteras';
import { ultimaTasa } from '../db/movimientos';
import { NOMBRE_PAR, PARES } from '../lib/api-tasas';
import type { Moneda } from '../lib/moneda';
import { formatearTasa, hayBolivar, tasaATexto, tasaConMargen } from '../lib/tasa';
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
 * esas monedas, BCV, paralelo y la del banco (BCV + su margen). Siempre editable.
 */
export function SugerenciasTasa({ de, a, billeteras, onElegir }: Props) {
  const db = useSQLiteContext();
  const { tasas } = useTasas();
  const [ultima, setUltima] = useState<number | null>(null);

  useEffect(() => {
    ultimaTasa(db, de, a).then(setUltima).catch(() => setUltima(null));
  }, [db, de, a]);

  const conBolivar = hayBolivar(de, a);
  const bcv = tasas.BCV?.tasa;
  const bancos = conBolivar && bcv ? billeteras.filter((b): b is Billetera => !!b && b.moneda === 'BS' && b.margen_cambio !== null) : [];
  const opciones: { clave: string; texto: string; tasa: number; icono: string }[] = [];
  if (ultima) opciones.push({ clave: 'ultima', texto: `Última ${formatearTasa(ultima)}`, tasa: ultima, icono: 'history' });
  for (const b of bancos) {
    const t = tasaConMargen(bcv!, b.margen_cambio!);
    opciones.push({ clave: `banco-${b.id}`, texto: `${b.nombre} ${formatearTasa(t)}`, tasa: t, icono: 'bank' });
  }
  if (conBolivar) {
    for (const p of PARES) {
      const t = tasas[p]?.tasa;
      if (t) opciones.push({ clave: p, texto: `${NOMBRE_PAR[p]} ${formatearTasa(t)}`, tasa: t, icono: 'lightning-bolt' });
    }
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
