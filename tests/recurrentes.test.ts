import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearBilletera, ErrorValidacion, obtenerBilletera } from '../src/db/billeteras';
import { listarCategorias } from '../src/db/categorias';
import { listarMovimientos } from '../src/db/movimientos';
import {
  confirmarRecurrente,
  crearRecurrente,
  listarRecurrentes,
  procesarRecurrentes,
  saltarRecurrente,
  siguienteFecha,
} from '../src/db/recurrentes';
import { crearBdMemoria } from './bd-memoria';

test('siguienteFecha: semanal, quincenal venezolana y mensual sin corrimiento', () => {
  assert.equal(siguienteFecha('2026-09-28', 'SEMANAL', 28), '2026-10-05');
  assert.equal(siguienteFecha('2026-09-01', 'QUINCENAL', 1), '2026-09-15');
  assert.equal(siguienteFecha('2026-09-15', 'QUINCENAL', 15), '2026-09-30');
  assert.equal(siguienteFecha('2026-09-30', 'QUINCENAL', 30), '2026-10-15');
  assert.equal(siguienteFecha('2027-02-15', 'QUINCENAL', 15), '2027-02-28');
  assert.equal(siguienteFecha('2026-01-31', 'MENSUAL', 31), '2026-02-28');
  assert.equal(siguienteFecha('2026-02-28', 'MENSUAL', 31), '2026-03-31');
  assert.equal(siguienteFecha('2026-12-05', 'MENSUAL', 5), '2027-01-05');
});

test('automáticos se registran solos (también los atrasados); manuales esperan confirmación', async () => {
  const db = await crearBdMemoria();
  const banco = await crearBilletera(db, { nombre: 'Banco', moneda: 'BS', balance_inicial: 10000000, icono: 'bank', color_hex: '#000000' });
  const [, , servicios] = await listarCategorias(db, 'GASTO');
  const [salario] = await listarCategorias(db, 'INGRESO');

  await crearRecurrente(db, {
    nombre: 'Internet', tipo: 'GASTO', monto: 150000, billetera_id: banco, categoria_id: servicios.id,
    frecuencia: 'MENSUAL', proxima_fecha: '2026-08-05', automatico: true,
  });
  const luz = await crearRecurrente(db, {
    nombre: 'Luz', tipo: 'GASTO', monto: 50000, billetera_id: banco, categoria_id: servicios.id,
    frecuencia: 'MENSUAL', proxima_fecha: '2026-09-10', automatico: false,
  });
  await crearRecurrente(db, {
    nombre: 'Sueldo', tipo: 'INGRESO', monto: 3000000, billetera_id: banco, categoria_id: salario.id,
    frecuencia: 'QUINCENAL', proxima_fecha: '2026-09-30', automatico: true,
  });
  await assert.rejects(
    crearRecurrente(db, { nombre: 'X', tipo: 'INGRESO', monto: 1, billetera_id: banco, categoria_id: servicios.id, frecuencia: 'MENSUAL', proxima_fecha: '2026-09-01', automatico: true }),
    ErrorValidacion,
  );

  const r = await procesarRecurrentes(db, new Date(2026, 8, 22, 9));
  assert.equal(r.creados, 2); // internet de agosto y septiembre
  assert.deepEqual(r.pendientes.map((p) => p.nombre), ['Luz']);
  assert.equal((await obtenerBilletera(db, banco))!.saldo, 10000000 - 300000);
  const internet = (await listarRecurrentes(db)).find((x) => x.nombre === 'Internet')!;
  assert.equal(internet.proxima_fecha, '2026-10-05');

  // La luz vino más cara este mes.
  await confirmarRecurrente(db, luz, 62000);
  const [ultimo] = await listarMovimientos(db, { limite: 1 });
  assert.equal(ultimo.nota, 'Luz');
  assert.equal(ultimo.monto, 62000);
  await saltarRecurrente(db, luz);
  assert.equal((await listarRecurrentes(db)).find((x) => x.id === luz)!.proxima_fecha, '2026-11-10');

  // Repetir el proceso el mismo día no duplica nada.
  assert.equal((await procesarRecurrentes(db, new Date(2026, 8, 22, 18))).creados, 0);
});

test('aporte automático a una meta y proyección', async () => {
  const { crearBdMemoria } = await import('./bd-memoria');
  const { crearBilletera, obtenerBilletera } = await import('../src/db/billeteras');
  const { crearMeta, obtenerMeta } = await import('../src/db/metas');
  const { aporteDeMeta, guardarAporteDeMeta, procesarRecurrentes, proyeccionMeta } = await import('../src/db/recurrentes');
  const db = await crearBdMemoria();
  const usd = await crearBilletera(db, { icono: 'x', color_hex: '#000', nombre: 'Efectivo', moneda: 'USD', balance_inicial: 10000 });
  const bs = await crearBilletera(db, { icono: 'x', color_hex: '#000', nombre: 'Banco', moneda: 'BS', balance_inicial: 0 });
  const meta = await crearMeta(db, { nombre: 'Moto', monto_objetivo: 150000, moneda: 'USD', fecha_objetivo: null, color_hex: '#000' });

  await assert.rejects(
    guardarAporteDeMeta(db, meta, { monto: 2000, billetera_id: bs, frecuencia: 'QUINCENAL', proxima_fecha: '2026-09-15' }),
    /misma moneda/,
  );
  await guardarAporteDeMeta(db, meta, { monto: 2000, billetera_id: usd, frecuencia: 'QUINCENAL', proxima_fecha: '2026-09-15' });
  // Al abrir la app el 23 sep se registra el aporte del 15 (el del 30 aún no toca).
  await procesarRecurrentes(db, new Date(2026, 8, 23, 10));
  assert.equal((await obtenerMeta(db, meta))!.saldo, 2000);
  assert.equal((await obtenerBilletera(db, usd))!.saldo, 8000);
  const a = (await aporteDeMeta(db, meta))!;
  assert.equal(a.proxima_fecha, '2026-09-30');
  // Faltan $1.480 a $20 por quincena: 74 aportes; el primero el 30 sep 2026 y el último el 15 oct 2029.
  assert.deepEqual(proyeccionMeta(148000, a), { aportes: 74, fecha: '2029-10-15' });
  await guardarAporteDeMeta(db, meta, null);
  assert.equal(await aporteDeMeta(db, meta), null);
});
