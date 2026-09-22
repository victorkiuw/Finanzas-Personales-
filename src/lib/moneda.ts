// Todos los montos se guardan como enteros en céntimos para evitar errores de
// redondeo de punto flotante al sumar saldos. Solo las tasas de cambio son REAL.

export type Moneda = 'USD' | 'BS' | 'USDT';

export const MONEDAS: readonly Moneda[] = ['USD', 'BS', 'USDT'];

export const INFO_MONEDA: Record<Moneda, { nombre: string; corto: string }> = {
  USD: { nombre: 'Dólares', corto: 'USD' },
  BS: { nombre: 'Bolívares', corto: 'Bs.' },
  USDT: { nombre: 'Tether (USDT)', corto: 'USDT' },
};

export function esMoneda(valor: unknown): valor is Moneda {
  return typeof valor === 'string' && (MONEDAS as readonly string[]).includes(valor);
}

/** Formato venezolano: punto para miles y coma para decimales. */
export function formatearNumero(centimos: number): string {
  const negativo = centimos < 0;
  const abs = Math.abs(Math.round(centimos));
  const entero = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimales = (abs % 100).toString().padStart(2, '0');
  return `${negativo ? '-' : ''}${entero},${decimales}`;
}

export function formatearMonto(centimos: number, moneda: Moneda): string {
  const numero = formatearNumero(centimos);
  switch (moneda) {
    case 'USD':
      return numero.startsWith('-') ? `-$${numero.slice(1)}` : `$${numero}`;
    case 'BS':
      return `Bs. ${numero}`;
    case 'USDT':
      return `${numero} USDT`;
  }
}

/**
 * Convierte lo que el usuario escribe a céntimos. Acepta "1234.56", "1234,56",
 * "1.234,56" y "1,234.56". Si aparecen ambos separadores, el último es el
 * decimal; si un mismo separador aparece varias veces, es de miles; si aparece
 * una sola vez, es decimal. Devuelve null si el texto no es un número válido.
 */
export function parsearMonto(texto: string): number | null {
  let limpio = texto.replace(/[\s$]|Bs\.?|USDT?/gi, '');
  let negativo = false;
  if (limpio.startsWith('-')) {
    negativo = true;
    limpio = limpio.slice(1);
  }
  if (!/^[\d.,]+$/.test(limpio) || !/\d/.test(limpio)) return null;

  const ultimoPunto = limpio.lastIndexOf('.');
  const ultimaComa = limpio.lastIndexOf(',');
  let decimal: '.' | ',' | null = null;
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    decimal = ultimoPunto > ultimaComa ? '.' : ',';
  } else if (ultimoPunto >= 0 || ultimaComa >= 0) {
    const sep = ultimoPunto >= 0 ? '.' : ',';
    decimal = limpio.split(sep).length === 2 ? sep : null;
  }

  let parteEntera = limpio;
  let parteDecimal = '';
  if (decimal) {
    const i = limpio.lastIndexOf(decimal);
    parteEntera = limpio.slice(0, i);
    parteDecimal = limpio.slice(i + 1);
    if (/[.,]/.test(parteDecimal) || parteEntera.includes(decimal)) return null;
  }
  parteEntera = parteEntera.replace(/[.,]/g, '');

  const valor = Number(`${parteEntera || '0'}.${parteDecimal || '0'}`);
  if (!Number.isFinite(valor)) return null;
  const centimos = Math.round(valor * 100);
  return negativo ? -centimos : centimos;
}

/** Texto para precargar un campo de edición a partir de céntimos, p. ej. "1234,5". */
export function centimosATexto(centimos: number): string {
  if (centimos === 0) return '';
  const signo = centimos < 0 ? '-' : '';
  const abs = Math.abs(centimos);
  const decimales = abs % 100;
  const entero = Math.floor(abs / 100);
  if (decimales === 0) return `${signo}${entero}`;
  return `${signo}${entero},${decimales.toString().padStart(2, '0')}`;
}
