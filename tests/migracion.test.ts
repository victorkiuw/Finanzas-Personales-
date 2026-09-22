import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migrar, VERSION_ESQUEMA } from '../src/db/esquema';
import type { BaseDatos, ValorSQL } from '../src/db/tipos';

function adaptador(sql: DatabaseSync): BaseDatos {
  return {
    async execAsync(s) {
      sql.exec(s);
    },
    async runAsync(s, p: ValorSQL[]) {
      const r = sql.prepare(s).run(...p);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getAllAsync<T>(s: string, p: ValorSQL[]) {
      return sql.prepare(s).all(...p) as T[];
    },
    async getFirstAsync<T>(s: string, p: ValorSQL[]) {
      return (sql.prepare(s).get(...p) as T | undefined) ?? null;
    },
  };
}

test('la migración v6 reconstruye transacciones sin perder datos ni enlaces', async () => {
  const sql = new DatabaseSync(':memory:');
  const db = adaptador(sql);
  await migrar(db, 5);
  sql.exec(`
    INSERT INTO billeteras (id, nombre, moneda, balance_inicial) VALUES (1, 'Banco', 'BS', 100000);
    INSERT INTO transacciones (id, tipo, monto, fecha, categoria_id, billetera_origen_id, nota)
      VALUES (10, 'GASTO', 5000, '2026-09-01T00:00:00Z', 1, 1, 'pago');
    INSERT INTO transacciones (id, tipo, monto, fecha, categoria_id, billetera_origen_id, comision_de)
      VALUES (11, 'GASTO', 1400, '2026-09-01T00:00:00Z', 9, 1, 10);
  `);

  await migrar(db);
  const v = sql.prepare('PRAGMA user_version').get() as { user_version: number };
  assert.equal(v.user_version, VERSION_ESQUEMA);
  const filas = sql.prepare('SELECT id, monto, comision_de, nota FROM transacciones ORDER BY id').all();
  assert.deepEqual(filas.map((f) => ({ ...f })), [
    { id: 10, monto: 5000, comision_de: null, nota: 'pago' },
    { id: 11, monto: 1400, comision_de: 10, nota: null },
  ]);
  // La referencia de la comisión apunta a la tabla renombrada: borrar el padre borra la comisión.
  sql.exec('DELETE FROM transacciones WHERE id = 10');
  assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM transacciones').get() as { n: number }).n, 0);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
  // Los ids siguen avanzando desde donde iban.
  sql.exec(`INSERT INTO transacciones (tipo, monto, fecha, categoria_id, billetera_origen_id) VALUES ('GASTO', 1, 'x', 1, 1)`);
  assert.equal((sql.prepare('SELECT MAX(id) AS m FROM transacciones').get() as { m: number }).m, 12);
});
