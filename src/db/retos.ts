import { claveDia } from '../lib/fechas';
import type { BaseDatos } from './tipos';

/*
 * Retos de ahorro: la racha de días sin gastos "variables" (los fijos como el
 * alquiler no la rompen) y el reto de las 52 semanas (semana n: ahorrar n veces
 * la base), que se va marcando a mano.
 */

/** Días ("AAAA-MM-DD" locales) con algún gasto no fijo, desde `desde`. */
export async function diasConGasto(db: BaseDatos, desde: string): Promise<Set<string>> {
  const filas = await db.getAllAsync<{ fecha: string }>(
    `SELECT t.fecha FROM transacciones t JOIN categorias c ON c.id = t.categoria_id
     WHERE t.tipo = 'GASTO' AND c.fija = 0 AND t.comision_de IS NULL AND t.fecha >= ?`,
    [desde],
  );
  return new Set(filas.map((f) => claveDia(f.fecha)));
}

const clave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Racha actual de días seguidos sin gastar (hoy cuenta si aún no se ha gastado)
 * y la mejor racha en los días revisados (desde `inicio`).
 */
export function rachaSinGastar(conGasto: Set<string>, inicio: Date, hoy = new Date()): { actual: number; mejor: number } {
  let actual = 0;
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const primero = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  while (d >= primero && !conGasto.has(clave(d))) {
    actual++;
    d.setDate(d.getDate() - 1);
  }
  let mejor = 0;
  let corrida = 0;
  for (const x = new Date(primero); x <= hoy; x.setDate(x.getDate() + 1)) {
    corrida = conGasto.has(clave(x)) ? 0 : corrida + 1;
    mejor = Math.max(mejor, corrida);
  }
  return { actual, mejor: Math.max(mejor, actual) };
}

export interface Reto52 {
  /** Céntimos de la semana 1 (la semana n es n × base). */
  base: number;
  moneda: 'USD' | 'BS' | 'USDT' | 'EUR';
  marcadas: number[];
}

export const CLAVE_RETO_52 = 'reto_52_semanas';

export function totalReto52(r: Reto52): { ahorrado: number; meta: number } {
  return { ahorrado: r.marcadas.reduce((s, n) => s + n * r.base, 0), meta: (52 * 53 * r.base) / 2 };
}
