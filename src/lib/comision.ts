/*
 * Comisión de Pago Móvil. Límites máximos del BCV vigentes desde agosto de 2026
 * (Gaceta Oficial 43.427): persona a persona 0,30 % con mínimo Bs. 14; persona a
 * comercio hasta 1,5 % con mínimo Bs. 14. Cada banco puede cobrar menos, por eso
 * se configura por billetera.
 */

export interface ConfigComision {
  /** Porcentaje, p. ej. 0.3 para 0,30 %. */
  porcentaje: number;
  /** Céntimos en la moneda de la billetera. */
  minima: number;
}

export const PRESETS_COMISION: { nombre: string; config: ConfigComision }[] = [
  { nombre: 'Sin comisión', config: { porcentaje: 0, minima: 0 } },
  { nombre: 'Pago Móvil a persona (0,3 %, mín. Bs. 14)', config: { porcentaje: 0.3, minima: 1400 } },
  { nombre: 'Pago Móvil a comercio (1,5 %, mín. Bs. 14)', config: { porcentaje: 1.5, minima: 1400 } },
];

export function tieneComision(c: ConfigComision): boolean {
  return c.porcentaje > 0 || c.minima > 0;
}

/** Comisión en céntimos para un monto en céntimos: el porcentaje, pero nunca menos que el mínimo. */
export function calcularComision(monto: number, c: ConfigComision): number {
  if (!tieneComision(c) || monto <= 0) return 0;
  return Math.max(Math.round((monto * c.porcentaje) / 100), c.minima);
}

export function describirComision(c: ConfigComision, formatear: (centimos: number) => string): string {
  if (!tieneComision(c)) return 'Sin comisión';
  const pct = `${String(c.porcentaje).replace('.', ',')} %`;
  return c.minima > 0 ? `${pct} (mín. ${formatear(c.minima)})` : pct;
}
