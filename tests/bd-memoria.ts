import { DatabaseSync } from 'node:sqlite';

import { migrar } from '../src/db/esquema';
import type { BaseDatos, ValorSQL } from '../src/db/tipos';

/** Adaptador de node:sqlite con la misma interfaz que expo-sqlite. */
export async function crearBdMemoria(): Promise<BaseDatos & { sql: DatabaseSync }> {
  const sql = new DatabaseSync(':memory:');
  const db = {
    sql,
    async execAsync(source: string) {
      sql.exec(source);
    },
    async runAsync(source: string, params: ValorSQL[]) {
      const r = sql.prepare(source).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getAllAsync<T>(source: string, params: ValorSQL[]) {
      return sql.prepare(source).all(...params) as T[];
    },
    async getFirstAsync<T>(source: string, params: ValorSQL[]) {
      return (sql.prepare(source).get(...params) as T | undefined) ?? null;
    },
  };
  await migrar(db);
  return db;
}
