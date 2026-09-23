import {
  consultarHistorico,
  consultarTasas,
  PARES,
  TODOS_LOS_PARES,
  type Par,
  type ParDolar,
  type TasaConsultada,
  type TasaDiaria,
} from '../lib/api-tasas';
import type { Cambio } from '../lib/conversion';
import { claveDia } from '../lib/fechas';
import { guardarPreferencia, leerPreferencia } from './preferencias';
import type { BaseDatos } from './tipos';

export interface TasaGuardada {
  par: Par;
  /** Bolívares por dólar. */
  tasa: number;
  /** Fecha de la cotización (según la fuente, o cuándo se escribió a mano). */
  ultima_actualizacion: string;
  /** Cuándo se obtuvo en este teléfono. */
  consultada_en: string | null;
  origen: 'API' | 'MANUAL';
}

export type Tasas = Partial<Record<Par, TasaGuardada>>;

export async function obtenerTasas(db: BaseDatos): Promise<Tasas> {
  const filas = await db.getAllAsync<TasaGuardada>(
    `SELECT par, tasa, ultima_actualizacion, consultada_en, origen FROM tasas_cache`,
    [],
  );
  const tasas: Tasas = {};
  for (const f of filas) tasas[f.par] = f;
  return tasas;
}

export async function guardarTasa(
  db: BaseDatos,
  par: Par,
  t: TasaConsultada,
  origen: 'API' | 'MANUAL',
  ahora = new Date(),
): Promise<void> {
  if (!TODOS_LOS_PARES.includes(par) || !(t.tasa > 0)) throw new Error('Tasa inválida.');
  await db.runAsync(
    `INSERT INTO tasas_cache (par, tasa, ultima_actualizacion, consultada_en, origen) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (par) DO UPDATE SET
       tasa = excluded.tasa, ultima_actualizacion = excluded.ultima_actualizacion,
       consultada_en = excluded.consultada_en, origen = excluded.origen`,
    [par, t.tasa, t.fecha, ahora.toISOString(), origen],
  );
  // La tasa vigente también queda como la del día de hoy en el historial.
  await guardarHistorial(db, [{ par, dia: claveDia(ahora.toISOString()), tasa: t.tasa }]);
}

export async function guardarHistorial(db: BaseDatos, tasas: TasaDiaria[]): Promise<void> {
  // Por lotes para no pasar el límite de parámetros de SQLite.
  for (let i = 0; i < tasas.length; i += 200) {
    const lote = tasas.slice(i, i + 200);
    await db.runAsync(
      `INSERT OR REPLACE INTO historial_tasas (par, dia, tasa) VALUES ${lote.map(() => '(?, ?, ?)').join(', ')}`,
      lote.flatMap((t) => [t.par, t.dia, t.tasa]),
    );
  }
}

export async function listarHistorial(db: BaseDatos, par: Par): Promise<{ dia: string; tasa: number }[]> {
  return db.getAllAsync(`SELECT dia, tasa FROM historial_tasas WHERE par = ? ORDER BY dia`, [par]);
}

const CLAVE_HISTORICO = 'historico_sincronizado_en';

/** Descarga el histórico diario como máximo una vez al día. Devuelve true si lo actualizó. */
export async function sincronizarHistorico(
  db: BaseDatos,
  consultar: () => Promise<TasaDiaria[]> = () => consultarHistorico(),
  ahora = new Date(),
): Promise<boolean> {
  const ultima = await leerPreferencia(db, CLAVE_HISTORICO);
  if (ultima && claveDia(ultima) === claveDia(ahora.toISOString())) return false;
  const tasas = await consultar();
  await guardarHistorial(db, tasas);
  await guardarPreferencia(db, CLAVE_HISTORICO, ahora.toISOString());
  return true;
}

/**
 * Consulta la API y guarda lo recibido. Si falla, lanza el error y el caché
 * queda intacto, así la app sigue usando la última tasa conocida.
 */
export async function actualizarTasasDesdeApi(
  db: BaseDatos,
  consultar: () => Promise<Partial<Record<Par, TasaConsultada>>> = () => consultarTasas(),
): Promise<Tasas> {
  const nuevas = await consultar();
  for (const par of TODOS_LOS_PARES) {
    const t = nuevas[par];
    if (t) await guardarTasa(db, par, t, 'API');
  }
  return obtenerTasas(db);
}

/** Minutos tras los cuales se intenta refrescar automáticamente. */
export const MINUTOS_VIGENCIA = 30;

export function tasasVencidas(tasas: Tasas, ahora = new Date()): boolean {
  // Sin tasa del euro (p. ej. recién actualizada la app) se consulta de una vez.
  if (!tasas.EURO) return true;
  return PARES.some((par) => {
    const t = tasas[par];
    if (!t?.consultada_en) return true;
    return ahora.getTime() - Date.parse(t.consultada_en) > MINUTOS_VIGENCIA * 60_000;
  });
}

/** Última tasa guardada antes de `dia` ("AAAA-MM-DD"), para comparar con la de hoy. */
export async function tasaAnterior(db: BaseDatos, par: Par, dia: string): Promise<number | null> {
  const f = await db.getFirstAsync<{ tasa: number }>(
    `SELECT tasa FROM historial_tasas WHERE par = ? AND dia < ? ORDER BY dia DESC LIMIT 1`,
    [par, dia],
  );
  return f?.tasa ?? null;
}

/**
 * Une dos historiales en una misma línea de días desde `desde` hasta el último
 * dato, repitiendo el valor anterior los días sin cotización (fines de semana).
 */
export function alinearHistoriales(
  series: { dia: string; tasa: number }[][],
  desde: string,
): { dias: string[]; valores: (number | null)[][] } {
  const todosLosDias = [...new Set(series.flat().map((p) => p.dia))].filter((d) => d >= desde).sort();
  const valores = series.map((serie) => {
    const mapa = new Map(serie.map((p) => [p.dia, p.tasa]));
    let ultimo: number | null = serie.filter((p) => p.dia < desde).at(-1)?.tasa ?? null;
    return todosLosDias.map((d) => {
      ultimo = mapa.get(d) ?? ultimo;
      return ultimo;
    });
  });
  return { dias: todosLosDias, valores };
}

/**
 * Bs. por euro coherente con la referencia del dólar: con BCV es el euro BCV;
 * con USDT se aplica al USDT la misma relación euro/dólar del BCV, para que
 * los euros no queden subvalorados frente a los dólares.
 */
export function euroSegun(dolarRef: number | null, bcv: number | null, euroBcv: number | null): number | null {
  if (!dolarRef || !bcv || !euroBcv) return null;
  return dolarRef === bcv ? euroBcv : (dolarRef * euroBcv) / bcv;
}

/** Tasas vigentes para convertir con la referencia elegida. */
export function cambioDe(tasas: Tasas, referencia: ParDolar): Cambio {
  const dolar = tasas[referencia]?.tasa ?? null;
  return { dolar, euro: euroSegun(dolar, tasas.BCV?.tasa ?? null, tasas.EURO?.tasa ?? null) };
}
