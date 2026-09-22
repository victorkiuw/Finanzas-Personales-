import { consultarTasas, PARES, type Par, type TasaConsultada } from '../lib/api-tasas';
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
  if (!PARES.includes(par) || !(t.tasa > 0)) throw new Error('Tasa inválida.');
  await db.runAsync(
    `INSERT INTO tasas_cache (par, tasa, ultima_actualizacion, consultada_en, origen) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (par) DO UPDATE SET
       tasa = excluded.tasa, ultima_actualizacion = excluded.ultima_actualizacion,
       consultada_en = excluded.consultada_en, origen = excluded.origen`,
    [par, t.tasa, t.fecha, ahora.toISOString(), origen],
  );
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
  for (const par of PARES) {
    const t = nuevas[par];
    if (t) await guardarTasa(db, par, t, 'API');
  }
  return obtenerTasas(db);
}

/** Minutos tras los cuales se intenta refrescar automáticamente. */
export const MINUTOS_VIGENCIA = 30;

export function tasasVencidas(tasas: Tasas, ahora = new Date()): boolean {
  return PARES.some((par) => {
    const t = tasas[par];
    if (!t?.consultada_en) return true;
    return ahora.getTime() - Date.parse(t.consultada_en) > MINUTOS_VIGENCIA * 60_000;
  });
}
