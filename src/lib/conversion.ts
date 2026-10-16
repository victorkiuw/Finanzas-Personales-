import { equivalentes, type Moneda } from './moneda';

/*
 * Modelo de conversión: todo pasa por el bolívar con las tasas del `Cambio`
 * (Bs. por unidad): el dólar según la referencia elegida (BCV o USDT) y el
 * euro. Si además se conocen la BCV y la USDT, cada dólar va con la suya: el
 * USD a tasa BCV y el USDT a tasa USDT, así $10 BCV no son 10 USDT sino
 * 10 × BCV / USDT. Sin esas dos tasas, USD y USDT se toman 1:1.
 */

export interface Cambio {
  /** Bs. por dólar (USD o USDT). */
  dolar: number | null;
  /** Bs. por euro. */
  euro: number | null;
  /** Bs. por USD (tasa BCV), para valorar los USD aparte de los USDT. */
  bcv?: number | null;
  /** Bs. por USDT. */
  usdt?: number | null;
}

/** ¿Se puede distinguir USD (BCV) de USDT con este cambio? */
function conDosDolares(c: Cambio): boolean {
  return !!c.bcv && !!c.usdt;
}

/** Bs. por unidad de la moneda; null si falta esa tasa. */
export function bsPorUnidad(m: Moneda, cambio: Cambio): number | null {
  if (m === 'BS') return 1;
  if (m === 'EUR') return cambio.euro;
  if (conDosDolares(cambio)) return m === 'USD' ? cambio.bcv! : cambio.usdt!;
  return cambio.dolar;
}

/** Convierte céntimos de una moneda a otra; null si falta una tasa necesaria. */
export function convertir(centimos: number, de: Moneda, a: Moneda, cambio: Cambio): number | null {
  if (de === a || (equivalentes(de, a) && !conDosDolares(cambio))) return centimos;
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
 * Conversión de la calculadora: todo pasa por el bolívar y cada moneda va con
 * su tasa (dólares con la BCV, USDT con la tasa USDT, euros con el euro BCV).
 * Así $10 BCV a 800 son Bs. 8.000, que a 1.000 son 8 USDT.
 */
export function convertirNatural(centimos: number, de: Moneda, a: Moneda, t: TasasNaturales): number | null {
  if (de === a) return centimos;
  const tasaDe = tasaNatural(de, t);
  const tasaA = tasaNatural(a, t);
  if (!tasaDe || !tasaA) return null;
  return Math.round((centimos * tasaDe) / tasaA);
}
