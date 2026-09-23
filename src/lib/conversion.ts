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

/** Tasas del día para la calculadora: cada moneda con su propia tasa en bolívares. */
export interface TasasNaturales {
  /** Bs. por dólar BCV. */
  bcv: number | null;
  /** Bs. por USDT (mercado). */
  usdt: number | null;
  /** Bs. por euro BCV. */
  euro: number | null;
}

/** Bs. por unidad con la tasa que corresponde a cada moneda: $ → BCV, USDT → USDT, € → euro BCV. */
export function tasaNatural(m: Moneda, t: TasasNaturales): number | null {
  if (m === 'BS') return 1;
  if (m === 'USD') return t.bcv;
  if (m === 'USDT') return t.usdt;
  return t.euro;
}

/**
 * Conversión de la calculadora: cada moneda con su tasa (bolívares a USDT con la
 * tasa USDT, a dólares con la BCV, a euros con el euro BCV). USD y USDT van 1:1
 * entre sí; euros y dólares se relacionan con el euro/dólar del BCV.
 */
export function convertirNatural(centimos: number, de: Moneda, a: Moneda, t: TasasNaturales): number | null {
  if (equivalentes(de, a)) return centimos;
  if (de === 'BS' || a === 'BS') {
    const tasaDe = tasaNatural(de, t);
    const tasaA = tasaNatural(a, t);
    if (!tasaDe || !tasaA) return null;
    return Math.round((centimos * tasaDe) / tasaA);
  }
  // Euros ↔ dólares (USD o USDT): relación del BCV.
  if (!t.euro || !t.bcv) return null;
  return de === 'EUR' ? Math.round((centimos * t.euro) / t.bcv) : Math.round((centimos * t.bcv) / t.euro);
}
