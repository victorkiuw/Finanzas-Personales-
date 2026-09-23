import { equivalentes, type Moneda } from './moneda';

/*
 * Modelo de conversión: USD y USDT se consideran equivalentes (1:1). El resto
 * se convierte pasando por el bolívar, con las tasas del `Cambio` (Bs. por
 * unidad): el dólar según la referencia elegida (BCV o USDT) y el euro.
 */

export interface Cambio {
  /** Bs. por dólar (USD o USDT). */
  dolar: number | null;
  /** Bs. por euro. */
  euro: number | null;
}

/** Bs. por unidad de la moneda; null si falta esa tasa. */
export function bsPorUnidad(m: Moneda, cambio: Cambio): number | null {
  if (m === 'BS') return 1;
  if (m === 'EUR') return cambio.euro;
  return cambio.dolar;
}

/** Convierte céntimos de una moneda a otra; null si falta una tasa necesaria. */
export function convertir(centimos: number, de: Moneda, a: Moneda, cambio: Cambio): number | null {
  if (equivalentes(de, a)) return centimos;
  const tasaDe = bsPorUnidad(de, cambio);
  const tasaA = bsPorUnidad(a, cambio);
  if (!tasaDe || !tasaA) return null;
  return Math.round((centimos * tasaDe) / tasaA);
}

/** Suma saldos en distintas monedas expresada en `base`; null si falta alguna tasa. */
export function totalConsolidado(
  saldos: { moneda: Moneda; saldo: number }[],
  base: Moneda,
  cambio: Cambio,
): number | null {
  let total = 0;
  for (const s of saldos) {
    if (s.saldo === 0) continue;
    const v = convertir(s.saldo, s.moneda, base, cambio);
    if (v === null) return null;
    total += v;
  }
  return total;
}

/** Diferencia porcentual del USDT (paralelo) sobre el BCV. */
export function brecha(bcv: number, paralelo: number): number {
  return (paralelo / bcv - 1) * 100;
}
