import type { Moneda } from './moneda';

/*
 * Modelo de conversión: USD y USDT se consideran equivalentes (1:1) y el
 * bolívar se convierte con la tasa elegida (BCV o paralelo), en Bs. por dólar.
 */

/** Convierte céntimos de una moneda a otra. */
export function convertir(centimos: number, de: Moneda, a: Moneda, bsPorDolar: number): number {
  if (de === a) return centimos;
  if (de === 'BS') return Math.round(centimos / bsPorDolar);
  if (a === 'BS') return Math.round(centimos * bsPorDolar);
  return centimos;
}

/** Suma saldos en distintas monedas expresada en `base`. */
export function totalConsolidado(
  saldos: { moneda: Moneda; saldo: number }[],
  base: Moneda,
  bsPorDolar: number,
): number {
  return saldos.reduce((total, s) => total + convertir(s.saldo, s.moneda, base, bsPorDolar), 0);
}

/** Diferencia porcentual del paralelo sobre el BCV. */
export function brecha(bcv: number, paralelo: number): number {
  return (paralelo / bcv - 1) * 100;
}
