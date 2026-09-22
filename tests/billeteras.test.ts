import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  actualizarBilletera,
  crearBilletera,
  crearBilleterasSugeridas,
  eliminarBilletera,
  ErrorValidacion,
  listarBilleteras,
  obtenerBilletera,
  totalesPorMoneda,
  type DatosBilletera,
} from '../src/db/billeteras';
import { migrar, VERSION_ESQUEMA } from '../src/db/esquema';
import { crearBdMemoria } from './bd-memoria';

const efectivo: DatosBilletera = {
  nombre: '  Efectivo  ',
  moneda: 'USD',
  balance_inicial: 10000,
  icono: 'cash',
  color_hex: '#2E7D32',
};

test('la migración crea el esquema, siembra categorías y es idempotente', async () => {
  const db = await crearBdMemoria();
  await migrar(db);
  const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  assert.equal(v?.user_version, VERSION_ESQUEMA);
  const cats = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM categorias', []);
  assert.equal(cats?.n, 15);
});

test('CRUD básico de billeteras', async () => {
  const db = await crearBdMemoria();
  const id = await crearBilletera(db, efectivo);
  const b = await obtenerBilletera(db, id);
  assert.equal(b?.nombre, 'Efectivo');
  assert.equal(b?.saldo, 10000);
  assert.equal(b?.archivada, false);

  await actualizarBilletera(db, id, { ...efectivo, nombre: 'Cartera', moneda: 'USDT' });
  assert.equal((await obtenerBilletera(db, id))?.moneda, 'USDT');

  assert.equal(await eliminarBilletera(db, id), 'eliminada');
  assert.equal(await obtenerBilletera(db, id), null);
});

test('valida los datos', async () => {
  const db = await crearBdMemoria();
  await assert.rejects(crearBilletera(db, { ...efectivo, nombre: '   ' }), ErrorValidacion);
  await assert.rejects(crearBilletera(db, { ...efectivo, nombre: 'x'.repeat(41) }), ErrorValidacion);
  await assert.rejects(
    crearBilletera(db, { ...efectivo, moneda: 'EUR' as never }),
    ErrorValidacion,
  );
  await assert.rejects(crearBilletera(db, { ...efectivo, balance_inicial: 1.5 }), ErrorValidacion);
});

test('el saldo refleja ingresos, gastos, transferencias y metas', async () => {
  const db = await crearBdMemoria();
  const usd = await crearBilletera(db, efectivo);
  const bs = await crearBilletera(db, { ...efectivo, nombre: 'Banco', moneda: 'BS', balance_inicial: 0 });
  await db.runAsync(
    `INSERT INTO metas_ahorro (nombre, monto_objetivo, moneda) VALUES ('Viaje', 100000, 'USD')`,
    [],
  );
  const hoy = new Date().toISOString();
  const ins = (tipo: string, monto: number, origen: number, extra = '', vals: number[] = []) =>
    db.runAsync(
      `INSERT INTO transacciones (tipo, monto, fecha, billetera_origen_id${extra ? ', ' + extra : ''})
       VALUES (?, ?, ?, ?${vals.map(() => ', ?').join('')})`,
      [tipo, monto, hoy, origen, ...vals],
    );

  await ins('INGRESO', 5000, usd);
  await ins('GASTO', 2000, usd);
  // Vende 20 USD a 150 Bs/USD.
  await ins('TRANSFERENCIA', 2000, usd, 'billetera_destino_id, monto_destino', [bs, 300000]);
  await ins('APORTE_META', 3000, usd, 'meta_id, monto_destino', [1, 3000]);
  await ins('RETIRO_META', 1000, usd, 'meta_id, monto_destino', [1, 1000]);

  const [bUsd, bBs] = await listarBilleteras(db);
  assert.equal(bUsd.saldo, 10000 + 5000 - 2000 - 2000 - 3000 + 1000);
  assert.equal(bBs.saldo, 300000);
});

test('con movimientos: no cambia la moneda y eliminar archiva', async () => {
  const db = await crearBdMemoria();
  const id = await crearBilletera(db, efectivo);
  await db.runAsync(
    `INSERT INTO transacciones (tipo, monto, fecha, billetera_origen_id) VALUES ('GASTO', 100, ?, ?)`,
    [new Date().toISOString(), id],
  );
  await assert.rejects(actualizarBilletera(db, id, { ...efectivo, moneda: 'BS' }), ErrorValidacion);
  await actualizarBilletera(db, id, { ...efectivo, nombre: 'Otro nombre' });

  assert.equal(await eliminarBilletera(db, id), 'archivada');
  assert.equal((await listarBilleteras(db)).length, 0);
  const todas = await listarBilleteras(db, { incluirArchivadas: true });
  assert.equal(todas[0].archivada, true);
});

test('las restricciones de la tabla transacciones rechazan datos incoherentes', async () => {
  const db = await crearBdMemoria();
  const id = await crearBilletera(db, efectivo);
  const hoy = new Date().toISOString();
  // Transferencia sin destino.
  await assert.rejects(
    db.runAsync(
      `INSERT INTO transacciones (tipo, monto, fecha, billetera_origen_id) VALUES ('TRANSFERENCIA', 1, ?, ?)`,
      [hoy, id],
    ),
  );
  // Monto no positivo.
  await assert.rejects(
    db.runAsync(
      `INSERT INTO transacciones (tipo, monto, fecha, billetera_origen_id) VALUES ('GASTO', 0, ?, ?)`,
      [hoy, id],
    ),
  );
  // Billetera inexistente (claves foráneas activas).
  await assert.rejects(
    db.runAsync(
      `INSERT INTO transacciones (tipo, monto, fecha, billetera_origen_id) VALUES ('GASTO', 1, ?, 999)`,
      [hoy],
    ),
  );
});

test('billeteras sugeridas y totales por moneda', async () => {
  const db = await crearBdMemoria();
  await crearBilleterasSugeridas(db);
  await crearBilletera(db, efectivo);
  const totales = totalesPorMoneda(await listarBilleteras(db));
  assert.deepEqual(totales, { USD: 10000, BS: 0, USDT: 0 });
});
