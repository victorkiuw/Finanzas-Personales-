import { INFO_MONEDA, type Moneda } from './moneda';

/*
 * La tasa de un cambio se expresa como la gente la dice: cuánto de la moneda
 * "débil" vale una unidad de la "fuerte". Bolívares por dólar o por euro
 * ("vendí a 150"), dólares por euro (1,15), y destino por origen entre USD y
 * USDT.
 */

const FUERZA: Record<Moneda, number> = { BS: 0, USD: 1, USDT: 1, EUR: 2 };

/** La tasa se da por unidad del destino (el origen es la moneda débil). */
function porUnidadDeDestino(origen: Moneda, destino: Moneda): boolean {
  return FUERZA[origen] < FUERZA[destino];
}

/** Tasa implícita a partir de lo enviado y lo recibido (ambos en céntimos). */
export function calcularTasa(origen: Moneda, destino: Moneda, enviado: number, recibido: number): number {
  if (porUnidadDeDestino(origen, destino)) return enviado / recibido;
  return recibido / enviado;
}

/** Monto recibido en céntimos a partir de lo enviado y la tasa. */
export function recibidoConTasa(origen: Moneda, destino: Moneda, enviado: number, tasa: number): number {
  if (porUnidadDeDestino(origen, destino)) return Math.round(enviado / tasa);
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

/** Etiqueta de la tasa según el par, p. ej. "Bs. por USDT" o "USD por €". */
export function unidadTasa(origen: Moneda, destino: Moneda): string {
  const corto = (m: Moneda) => INFO_MONEDA[m].corto;
  if (porUnidadDeDestino(origen, destino)) return `${corto(origen)} por ${corto(destino)}`;
  return `${corto(destino)} por ${corto(origen)}`;
}

/** Tasa del banco: la BCV más su margen en %, p. ej. 852,42 + 2 % = 869,47. */
export function tasaConMargen(bcv: number, margen: number): number {
  return Math.round(bcv * (1 + margen / 100) * 10000) / 10000;
}
