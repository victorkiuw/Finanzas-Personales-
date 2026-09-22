import { INFO_MONEDA, type Moneda } from './moneda';

/*
 * La tasa de una transferencia se expresa como la gente la dice: bolívares por
 * cada dólar/USDT cuando interviene el bolívar ("vendí a 150"), o unidades de
 * destino por unidad de origen en el resto de casos (USD ↔ USDT).
 */

export function hayBolivar(origen: Moneda, destino: Moneda): boolean {
  return origen === 'BS' || destino === 'BS';
}

/** Tasa implícita a partir de lo enviado y lo recibido (ambos en céntimos). */
export function calcularTasa(origen: Moneda, destino: Moneda, enviado: number, recibido: number): number {
  if (origen === 'BS' && destino !== 'BS') return enviado / recibido;
  return recibido / enviado;
}

/** Monto recibido en céntimos a partir de lo enviado y la tasa. */
export function recibidoConTasa(origen: Moneda, destino: Moneda, enviado: number, tasa: number): number {
  if (origen === 'BS' && destino !== 'BS') return Math.round(enviado / tasa);
  return Math.round(enviado * tasa);
}

export function formatearTasa(tasa: number): string {
  const decimales = tasa >= 100 ? 2 : 4;
  const [entero, frac] = tasa.toFixed(decimales).split('.');
  return `${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
}

/** Acepta "150", "150,25" o "150.25". Devuelve null si no es un número positivo. */
export function parsearTasa(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d*\.?\d+$/.test(limpio)) return null;
  const valor = Number(limpio);
  return valor > 0 ? valor : null;
}

/** Texto editable para un campo de tasa, p. ej. "150,25" o "0,9985". */
export function tasaATexto(tasa: number): string {
  const decimales = tasa >= 100 ? 2 : 4;
  return tasa.toFixed(decimales).replace(/\.?0+$/, '').replace('.', ',');
}

/** Etiqueta de la tasa según el par, p. ej. "Bs. por USDT". */
export function unidadTasa(origen: Moneda, destino: Moneda): string {
  const corto = (m: Moneda) => INFO_MONEDA[m].corto;
  if (origen === 'BS' && destino !== 'BS') return `${corto('BS')} por ${corto(destino)}`;
  return `${corto(destino)} por ${corto(origen)}`;
}

/** Tasa del banco: la BCV más su margen en %, p. ej. 852,42 + 2 % = 869,47. */
export function tasaConMargen(bcv: number, margen: number): number {
  return Math.round(bcv * (1 + margen / 100) * 10000) / 10000;
}
