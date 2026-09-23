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

test('la migración v9 (euros) reconstruye tablas sin perder datos, enlaces ni cascadas', async () => {
  const sql = new DatabaseSync(':memory:');
  const db = adaptador(sql);
  await migrar(db, 8);
  sql.exec(`
    INSERT INTO billeteras (id, nombre, moneda, balance_inicial, comision_porcentaje, comision_minima, margen_cambio)
      VALUES (1, 'Banco', 'BS', 100000, 0.3, 1400, 2), (2, 'Binance', 'USDT', 5000, 0, 0, NULL);
    INSERT INTO metas_ahorro (id, nombre, monto_objetivo, moneda) VALUES (1, 'Moto', 150000, 'USD');
    INSERT INTO deudas (id, tipo, persona, moneda, monto, tasa_referencia, fecha) VALUES (1, 'ME_DEBEN', 'Victoria', 'BS', 500000, 852.42, '2026-09-15');
    INSERT INTO transacciones (id, tipo, monto, fecha, billetera_origen_id, deuda_id, monto_destino, tasa_cambio)
      VALUES (10, 'PRESTAMO_DADO', 500000, '2026-09-15', 1, 1, 587, 852.42);
    INSERT INTO transacciones (id, tipo, monto, fecha, billetera_origen_id, meta_id, monto_destino)
      VALUES (11, 'APORTE_META', 700, '2026-09-16', 2, 1, 700);
    INSERT INTO presupuestos (categoria_id, monto, moneda) VALUES (1, 5000, 'USD');
    INSERT INTO recurrentes (nombre, tipo, monto, billetera_id, categoria_id, frecuencia, dia_ancla, proxima_fecha)
      VALUES ('Internet', 'GASTO', 30000, 1, 3, 'MENSUAL', 5, '2026-10-05');
    INSERT INTO tasas_cache (par, tasa, ultima_actualizacion, consultada_en, origen) VALUES ('BCV', 852.42, 'x', 'y', 'API');
    INSERT INTO historial_tasas (par, dia, tasa) VALUES ('PARALELO', '2026-09-22', 953.25);
    INSERT INTO preferencias (clave, valor) VALUES ('historico_sincronizado_en', '2026-09-22'), ('tasa_referencia', 'BCV');
  `);

  await migrar(db);
  const cuenta = (t: string) => (sql.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  assert.equal((sql.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, VERSION_ESQUEMA);
  assert.equal((sql.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
  // Nada se perdió, tampoco lo que cuelga de las billeteras (los recurrentes van en cascada).
  assert.deepEqual(
    ['billeteras', 'metas_ahorro', 'deudas', 'transacciones', 'presupuestos', 'recurrentes', 'tasas_cache', 'historial_tasas'].map(cuenta),
    [2, 1, 1, 2, 1, 1, 1, 1],
  );
  const banco = { ...(sql.prepare('SELECT * FROM billeteras WHERE id = 1').get() as object) };
  assert.deepEqual(
    { ...banco, creada_en: undefined },
    { id: 1, nombre: 'Banco', moneda: 'BS', balance_inicial: 100000, icono: 'wallet', color_hex: '#2E7D32', archivada: 0, creada_en: undefined,
      comision_porcentaje: 0.3, comision_minima: 1400, margen_cambio: 2, en_total: 1 },
  );
  // Solo se borra la marca del histórico (para bajarlo con el euro); las demás preferencias quedan.
  assert.deepEqual(sql.prepare('SELECT clave FROM preferencias').all().map((f) => ({ ...f })), [{ clave: 'tasa_referencia' }]);

  // Ahora se aceptan euros.
  sql.exec(`INSERT INTO billeteras (nombre, moneda) VALUES ('Euros', 'EUR');
            INSERT INTO tasas_cache (par, tasa, ultima_actualizacion) VALUES ('EURO', 978.17, 'x');`);
  assert.equal((sql.prepare('SELECT MAX(id) AS m FROM billeteras').get() as { m: number }).m, 3);
  // Las referencias apuntan a las tablas nuevas: borrar la deuda sigue borrando su préstamo,
  // y una meta con movimientos no se puede borrar.
  sql.exec('DELETE FROM deudas WHERE id = 1');
  assert.equal(cuenta('transacciones'), 1);
  assert.throws(() => sql.exec('DELETE FROM metas_ahorro WHERE id = 1'), /FOREIGN KEY/);
  sql.exec('DELETE FROM transacciones; DELETE FROM billeteras WHERE id = 1');
  assert.equal(cuenta('recurrentes'), 0);
});
