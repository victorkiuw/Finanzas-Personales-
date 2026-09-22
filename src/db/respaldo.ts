import { VERSION_ESQUEMA } from './esquema';
import { enTransaccion, type BaseDatos, type ValorSQL } from './tipos';

/*
 * Copia de seguridad en JSON: todas las tablas con datos del usuario. El
 * historial de tasas no se incluye (se vuelve a descargar solo).
 */

export const APP_RESPALDO = 'finanzas-personales';

/** En orden de inserción: primero lo que otras tablas referencian. */
const TABLAS = ['billeteras', 'categorias', 'metas_ahorro', 'transacciones', 'tasas_cache', 'preferencias'] as const;

type Fila = Record<string, ValorSQL>;

export interface Respaldo {
  app: typeof APP_RESPALDO;
  version: number;
  exportado_en: string;
  tablas: Record<(typeof TABLAS)[number], Fila[]>;
}

export class ErrorRespaldo extends Error {}

export async function exportarDatos(db: BaseDatos, ahora = new Date()): Promise<Respaldo> {
  const tablas = {} as Respaldo['tablas'];
  for (const t of TABLAS) {
    // Por id para que al importar los movimientos padre vayan antes que sus comisiones.
    const orden = t === 'tasas_cache' ? 'par' : t === 'preferencias' ? 'clave' : 'id';
    tablas[t] = (await db.getAllAsync<Fila>(`SELECT * FROM ${t} ORDER BY ${orden}`, [])).map((f) => ({ ...f }));
  }
  return { app: APP_RESPALDO, version: VERSION_ESQUEMA, exportado_en: ahora.toISOString(), tablas };
}

export function resumenRespaldo(r: Respaldo): string {
  const n = (t: keyof Respaldo['tablas']) => r.tablas[t].length;
  return `${n('billeteras')} billeteras, ${n('transacciones')} movimientos, ${n('metas_ahorro')} metas y ${n('categorias')} categorías`;
}

/** Comprueba que el JSON sea una copia de esta app y de una versión que se pueda cargar. */
export function validarRespaldo(json: unknown): Respaldo {
  const r = json as Partial<Respaldo> | null;
  if (!r || typeof r !== 'object' || r.app !== APP_RESPALDO || !r.tablas || typeof r.tablas !== 'object') {
    throw new ErrorRespaldo('El archivo no es una copia de seguridad de esta app.');
  }
  if (typeof r.version !== 'number' || r.version > VERSION_ESQUEMA) {
    throw new ErrorRespaldo('La copia es de una versión más nueva de la app. Actualiza la app primero.');
  }
  for (const t of TABLAS) {
    const filas = (r.tablas as Record<string, unknown>)[t] ?? [];
    if (!Array.isArray(filas) || filas.some((f) => !f || typeof f !== 'object' || Array.isArray(f))) {
      throw new ErrorRespaldo(`La tabla "${t}" de la copia está dañada.`);
    }
    (r.tablas as Record<string, unknown>)[t] = filas;
  }
  return r as Respaldo;
}

/**
 * Reemplaza TODOS los datos por los de la copia, en una sola transacción: si
 * algo falla no se pierde nada. Solo se copian las columnas que existen en la
 * versión actual (las que falten toman su valor por defecto).
 */
export async function importarDatos(db: BaseDatos, respaldo: Respaldo): Promise<void> {
  const columnas: Record<string, Set<string>> = {};
  for (const t of TABLAS) {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`, []);
    columnas[t] = new Set(info.map((c) => c.name));
  }

  await enTransaccion(db, async () => {
    // Las comisiones apuntan a otros movimientos: se validan las claves al confirmar.
    await db.execAsync('PRAGMA defer_foreign_keys = ON');
    for (const t of [...TABLAS].reverse()) await db.runAsync(`DELETE FROM ${t}`, []);
    for (const t of TABLAS) {
      for (const fila of respaldo.tablas[t]) {
        const cols = Object.keys(fila).filter((c) => columnas[t].has(c));
        if (cols.length === 0) continue;
        await db.runAsync(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => fila[c]),
        );
      }
    }
    // Obliga a recalcular la próxima sincronización del histórico de tasas.
    await db.runAsync(`DELETE FROM preferencias WHERE clave = 'historico_sincronizado_en'`, []);
  });
}
