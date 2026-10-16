import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearBilletera } from '../src/db/billeteras';
import { listarCategorias } from '../src/db/categorias';
import { crearMovimiento } from '../src/db/movimientos';
import { Conversor, filasDeReporte, totalesPorDia } from '../src/db/reportes';
import { montoCompacto } from '../src/lib/moneda';
import { crearBdMemoria } from './bd-memoria';

test('totales por día en la moneda base y filtros del reporte', async () => {
  const db = await crearBdMemoria();
  const base = { icono: 'wallet', color_hex: '#000000' };
  const bs = await crearBilletera(db, { ...base, nombre: 'Banco', moneda: 'BS', balance_inicial: 10000000 });
  const usd = await crearBilletera(db, { ...base, nombre: 'Efectivo', moneda: 'USD', balance_inicial: 100000 });
  const [comida, transporte] = await listarCategorias(db, 'GASTO');
  const [salario] = await listarCategorias(db, 'INGRESO');
  const d1 = new Date(2026, 9, 5, 10).toISOString();
  const d2 = new Date(2026, 9, 6, 22).toISOString();
  await crearMovimiento(db, { tipo: 'GASTO', monto: 100000, fecha: d1, billetera_origen_id: bs, categoria_id: comida.id });
  await crearMovimiento(db, { tipo: 'GASTO', monto: 500, fecha: d1, billetera_origen_id: usd, categoria_id: transporte.id });
  await crearMovimiento(db, { tipo: 'INGRESO', monto: 2000, fecha: d2, billetera_origen_id: usd, categoria_id: salario.id });

  const desde = new Date(2026, 9, 1).toISOString();
  const hasta = new Date(2026, 10, 1).toISOString();
  const filas = await filasDeReporte(db, desde, hasta);
  const porDia = totalesPorDia(filas, new Conversor([], 1000), 'USD');
  assert.deepEqual(porDia.get('2026-10-05'), { ingresos: 0, gastos: 100 + 500 });
  assert.deepEqual(porDia.get('2026-10-06'), { ingresos: 2000, gastos: 0 });

  assert.equal((await filasDeReporte(db, desde, hasta, { billeteraId: usd })).length, 2);
  assert.equal((await filasDeReporte(db, desde, hasta, { categoriaId: comida.id })).length, 1);
  assert.equal((await filasDeReporte(db, desde, hasta, { tipo: 'INGRESO' })).length, 1);
});

test('montos cortos para el calendario', () => {
  assert.equal(montoCompacto(85000), '850');
  assert.equal(montoCompacto(123456), '1,2k');
  assert.equal(montoCompacto(100000), '1k');
  assert.equal(montoCompacto(340000000), '3,4M');
});

test('duplicar un gasto con su comisión, pero no un movimiento de deuda', async () => {
  const { duplicarMovimiento, listarMovimientos } = await import('../src/db/movimientos');
  const { crearDeuda } = await import('../src/db/deudas');
  const { obtenerBilletera } = await import('../src/db/billeteras');
  const db = await crearBdMemoria();
  const banco = await crearBilletera(db, { icono: 'bank', color_hex: '#000000', nombre: 'Banco', moneda: 'BS', balance_inicial: 1000000 });
  const [comida] = await listarCategorias(db, 'GASTO');
  const id = await crearMovimiento(db, { tipo: 'GASTO', monto: 10000, fecha: new Date(2026, 9, 1).toISOString(), billetera_origen_id: banco, categoria_id: comida.id, nota: 'pan', comision: 1400 });
  const copia = await duplicarMovimiento(db, id);
  assert.notEqual(copia, id);
  assert.equal((await obtenerBilletera(db, banco))!.saldo, 1000000 - 2 * (10000 + 1400));
  const lista = await listarMovimientos(db, {});
  assert.equal(lista.filter((m) => m.nota === 'pan').length, 2);

  await crearDeuda(db, { tipo: 'ME_DEBEN', persona: 'Ana', moneda: 'BS', monto: 5000, tasa_referencia: 100, fecha: new Date().toISOString(), billetera_id: banco });
  const prestamo = (await listarMovimientos(db, {})).find((m) => m.tipo === 'PRESTAMO_DADO')!;
  await assert.rejects(duplicarMovimiento(db, prestamo.id), /no se puede duplicar/);
});
