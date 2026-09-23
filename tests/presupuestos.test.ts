import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearBilletera, ErrorValidacion } from '../src/db/billeteras';
import { eliminarCategoria, listarCategorias } from '../src/db/categorias';
import { crearMovimiento } from '../src/db/movimientos';
import { eliminarPresupuesto, estadoPresupuestos, guardarPresupuesto, listarPresupuestos } from '../src/db/presupuestos';
import { Conversor, filasDeReporte } from '../src/db/reportes';
import { crearBdMemoria } from './bd-memoria';

test('presupuestos: guardar, estado del mes y conversión con la tasa del día', async () => {
  const db = await crearBdMemoria();
  const base = { icono: 'wallet', color_hex: '#000000', balance_inicial: 0 };
  const usd = await crearBilletera(db, { ...base, nombre: 'Efectivo', moneda: 'USD' });
  const bs = await crearBilletera(db, { ...base, nombre: 'Banco', moneda: 'BS' });
  const [comida, transporte, servicios] = await listarCategorias(db, 'GASTO');
  const [salario] = await listarCategorias(db, 'INGRESO');

  await guardarPresupuesto(db, { categoria_id: comida.id, monto: 10000, moneda: 'USD' });
  await guardarPresupuesto(db, { categoria_id: transporte.id, monto: 5000, moneda: 'USD' });
  await guardarPresupuesto(db, { categoria_id: servicios.id, monto: 100000, moneda: 'BS' });
  await guardarPresupuesto(db, { categoria_id: comida.id, monto: 12000, moneda: 'USD' }); // actualiza
  await assert.rejects(guardarPresupuesto(db, { categoria_id: salario.id, monto: 1, moneda: 'USD' }), ErrorValidacion);
  await assert.rejects(guardarPresupuesto(db, { categoria_id: comida.id, monto: 0, moneda: 'USD' }), ErrorValidacion);
  assert.equal((await listarPresupuestos(db)).length, 3);

  const fecha = new Date(2026, 8, 10, 12).toISOString();
  await crearMovimiento(db, { tipo: 'GASTO', monto: 6000, fecha, billetera_origen_id: usd, categoria_id: comida.id });
  // Bs. 40.000 a 1.000 Bs./USD = $40 de comida → $100 de $120 (83 %, alerta).
  await crearMovimiento(db, { tipo: 'GASTO', monto: 4000000, fecha, billetera_origen_id: bs, categoria_id: comida.id });
  await crearMovimiento(db, { tipo: 'GASTO', monto: 6000, fecha, billetera_origen_id: usd, categoria_id: transporte.id });

  const filas = await filasDeReporte(db, new Date(2026, 8, 1).toISOString(), new Date(2026, 9, 1).toISOString());
  const estados = estadoPresupuestos(
    await listarPresupuestos(db),
    await listarCategorias(db),
    filas,
    new Conversor([{ dia: '2026-09-01', tasa: 1000 }], null),
  );
  assert.deepEqual(
    estados.map((e) => [e.nombre, e.gastado, e.estado]),
    [
      [transporte.nombre, 6000, 'excedido'],
      [comida.nombre, 10000, 'alerta'],
      [servicios.nombre, 0, 'ok'],
    ],
  );

  await eliminarPresupuesto(db, servicios.id);
  // Borrar la categoría (sin uso) borra su presupuesto.
  await eliminarPresupuesto(db, transporte.id);
  const extra = (await listarCategorias(db, 'GASTO'))[5];
  await guardarPresupuesto(db, { categoria_id: extra.id, monto: 1, moneda: 'BS' });
  await eliminarCategoria(db, extra.id);
  assert.deepEqual((await listarPresupuestos(db)).map((p) => p.categoria_id), [comida.id]);
});

test('movimientos rápidos (plantillas)', async () => {
  const { crearBdMemoria } = await import('./bd-memoria');
  const { crearBilletera, obtenerBilletera } = await import('../src/db/billeteras');
  const { listarCategorias } = await import('../src/db/categorias');
  const { crearPlantilla, eliminarPlantilla, listarPlantillas, usarPlantilla } = await import('../src/db/plantillas');
  const db = await crearBdMemoria();
  const banco = await crearBilletera(db, { icono: 'x', color_hex: '#000', nombre: 'Mercantil', moneda: 'BS', balance_inicial: 100000 });
  const [transporte] = (await listarCategorias(db, 'GASTO')).filter((c) => c.nombre === 'Transporte');
  const [salario] = await listarCategorias(db, 'INGRESO');
  await assert.rejects(crearPlantilla(db, { nombre: 'Pasaje', tipo: 'GASTO', monto: 2000, billetera_id: banco, categoria_id: salario.id }), /categoría/);
  await crearPlantilla(db, { nombre: 'Pasaje', tipo: 'GASTO', monto: 2000, billetera_id: banco, categoria_id: transporte.id });
  const [p] = await listarPlantillas(db);
  assert.equal(p.icono, transporte.icono);
  assert.equal(p.billetera_nombre, 'Mercantil');
  await usarPlantilla(db, p);
  await usarPlantilla(db, p, 2500);
  assert.equal((await obtenerBilletera(db, banco))!.saldo, 100000 - 4500);
  await eliminarPlantilla(db, p.id);
  assert.deepEqual(await listarPlantillas(db), []);
});
