import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearBilletera, ErrorValidacion, obtenerBilletera } from '../src/db/billeteras';
import { listarCategorias } from '../src/db/categorias';
import {
  crearMeta,
  eliminarMeta,
  listarMetas,
  moverFondosMeta,
  obtenerMeta,
  actualizarMeta,
  type DatosMeta,
} from '../src/db/metas';
import { crearMovimiento, eliminarMovimiento, listarMovimientos } from '../src/db/movimientos';
import { Conversor, filasDeReporte, resumirPeriodo, totalesPorMes } from '../src/db/reportes';
import { guardarTasa, listarHistorial, sincronizarHistorico } from '../src/db/tasas';
import { parsearHistorico } from '../src/lib/api-tasas';
import { crearBdMemoria } from './bd-memoria';

const hoy = '2026-09-22T12:00:00.000Z';

test('parsea el histórico de DolarApi', () => {
  const h = parsearHistorico([
    { fuente: 'oficial', compra: null, venta: null, promedio: 849.564, fecha: '2026-09-21' },
    { fuente: 'paralelo', compra: null, venta: null, promedio: 949.776482, fecha: '2026-09-21' },
    { fuente: 'otra', promedio: 1, fecha: '2026-09-21' },
    { fuente: 'oficial', promedio: 1, fecha: 'ayer' },
  ]);
  assert.deepEqual(h, [
    { par: 'BCV', dia: '2026-09-21', tasa: 849.564 },
    { par: 'PARALELO', dia: '2026-09-21', tasa: 949.776482 },
  ]);
});

test('historial: sincroniza una vez al día y guarda la tasa vigente como la de hoy', async () => {
  const db = await crearBdMemoria();
  let llamadas = 0;
  const consultar = async () => {
    llamadas++;
    return Array.from({ length: 450 }, (_, i) => ({
      par: 'BCV' as const,
      dia: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
      tasa: 100 + i,
    }));
  };
  const ahora = new Date(2026, 8, 22, 10);
  assert.equal(await sincronizarHistorico(db, consultar, ahora), true);
  assert.equal(await sincronizarHistorico(db, consultar, new Date(2026, 8, 22, 18)), false);
  assert.equal(await sincronizarHistorico(db, consultar, new Date(2026, 8, 23, 8)), true);
  assert.equal(llamadas, 2);
  assert.equal((await listarHistorial(db, 'BCV')).length, 450);

  await guardarTasa(db, 'PARALELO', { tasa: 950, fecha: hoy }, 'API', new Date(2026, 8, 22, 10));
  assert.deepEqual([...(await listarHistorial(db, 'PARALELO'))].map((h) => ({ ...h })), [{ dia: '2026-09-22', tasa: 950 }]);
});

test('Conversor usa la tasa del día del movimiento', () => {
  const c = new Conversor(
    [
      { dia: '2026-08-01', tasa: 100 },
      { dia: '2026-09-01', tasa: 200 },
    ],
    999,
  );
  assert.equal(c.tasaDelDia('2026-07-15'), 100); // antes del historial: la más antigua
  assert.equal(c.tasaDelDia('2026-08-20'), 100);
  assert.equal(c.tasaDelDia('2026-09-01'), 200);
  assert.equal(c.tasaDelDia('2026-12-31'), 200);
  assert.equal(new Conversor([], 500).tasaDelDia('2026-01-01'), 500);
  assert.equal(new Conversor([], null).aBase(100, 'BS', 'USD', hoy), null);
  assert.equal(new Conversor([], null).aBase(100, 'USDT', 'USD', hoy), 100);
});

test('resumen del periodo y totales por mes, sin contar transferencias ni metas', async () => {
  const db = await crearBdMemoria();
  const base = { balance_inicial: 0, icono: 'wallet', color_hex: '#000' };
  const usd = await crearBilletera(db, { ...base, nombre: 'Efectivo', moneda: 'USD', balance_inicial: 100000 });
  const bs = await crearBilletera(db, { ...base, nombre: 'Banco', moneda: 'BS' });
  const [comida, transporte] = await listarCategorias(db, 'GASTO');
  const [salario] = await listarCategorias(db, 'INGRESO');

  const agosto = new Date(2026, 7, 10, 12).toISOString();
  const septiembre = new Date(2026, 8, 10, 12).toISOString();
  await crearMovimiento(db, { tipo: 'INGRESO', monto: 50000, fecha: septiembre, billetera_origen_id: usd, categoria_id: salario.id });
  await crearMovimiento(db, { tipo: 'GASTO', monto: 2000, fecha: septiembre, billetera_origen_id: usd, categoria_id: comida.id });
  // 20.000 Bs. a 200 Bs./USD (tasa de septiembre) = 100 USD.
  await crearMovimiento(db, { tipo: 'GASTO', monto: 2000000, fecha: septiembre, billetera_origen_id: bs, categoria_id: transporte.id });
  // 10.000 Bs. en agosto a 100 Bs./USD = 100 USD.
  await crearMovimiento(db, { tipo: 'GASTO', monto: 1000000, fecha: agosto, billetera_origen_id: bs, categoria_id: comida.id });
  await crearMovimiento(db, {
    tipo: 'TRANSFERENCIA', monto: 1000, fecha: septiembre, billetera_origen_id: usd,
    billetera_destino_id: bs, monto_destino: 200000,
  });
  const meta = await crearMeta(db, { nombre: 'Viaje', monto_objetivo: 100000, moneda: 'USD', fecha_objetivo: null, color_hex: '#000' });
  await moverFondosMeta(db, { tipo: 'APORTE_META', meta_id: meta, billetera_id: usd, monto: 5000, fecha: septiembre });

  const conversor = new Conversor(
    [
      { dia: '2026-08-01', tasa: 100 },
      { dia: '2026-09-01', tasa: 200 },
    ],
    null,
  );
  const filas = await filasDeReporte(db, new Date(2026, 8, 1).toISOString(), new Date(2026, 9, 1).toISOString());
  const r = resumirPeriodo(filas, conversor, 'USD');
  assert.equal(r.ingresos, 50000);
  assert.equal(r.gastos, 2000 + 10000);
  assert.equal(r.balance, 50000 - 12000);
  assert.deepEqual(r.gastosPorCategoria.map((c) => [c.nombre, c.total]), [
    [transporte.nombre, 10000],
    [comida.nombre, 2000],
  ]);
  assert.equal(r.incompleto, false);

  const todas = await filasDeReporte(db, new Date(2026, 6, 1).toISOString(), new Date(2026, 9, 1).toISOString());
  assert.deepEqual(totalesPorMes(todas, conversor, 'USD', ['2026-07', '2026-08', '2026-09']), [
    { mes: '2026-07', ingresos: 0, gastos: 0 },
    { mes: '2026-08', ingresos: 0, gastos: 10000 },
    { mes: '2026-09', ingresos: 50000, gastos: 12000 },
  ]);

  // En Bs., el gasto en dólares de septiembre se convierte a 200.
  assert.equal(resumirPeriodo(filas, conversor, 'BS').gastos, 2000 * 200 + 2000000);
  // Sin ninguna tasa, lo que está en Bs. no se puede convertir.
  assert.equal(resumirPeriodo(filas, new Conversor([], null), 'USD').incompleto, true);
});

const viaje: DatosMeta = { nombre: 'Viaje', monto_objetivo: 100000, moneda: 'USD', fecha_objetivo: '2027-01-15', color_hex: '#1565C0' };

test('metas: aportar y retirar mueve dinero entre billetera y meta', async () => {
  const db = await crearBdMemoria();
  const base = { icono: 'wallet', color_hex: '#000' };
  const usd = await crearBilletera(db, { ...base, nombre: 'Efectivo', moneda: 'USD', balance_inicial: 50000 });
  const bs = await crearBilletera(db, { ...base, nombre: 'Banco', moneda: 'BS', balance_inicial: 10000000 });
  const id = await crearMeta(db, viaje);

  await moverFondosMeta(db, { tipo: 'APORTE_META', meta_id: id, billetera_id: usd, monto: 20000, fecha: hoy });
  // 95.000 Bs. a 950 = 100 USD.
  await moverFondosMeta(db, { tipo: 'APORTE_META', meta_id: id, billetera_id: bs, monto: 9500000, monto_meta: 10000, fecha: hoy });
  assert.equal((await obtenerMeta(db, id))!.saldo, 30000);
  assert.equal((await obtenerBilletera(db, usd))!.saldo, 30000);
  assert.equal((await obtenerBilletera(db, bs))!.saldo, 500000);

  await moverFondosMeta(db, { tipo: 'RETIRO_META', meta_id: id, billetera_id: usd, monto: 5000, fecha: hoy, nota: 'emergencia' });
  assert.equal((await obtenerMeta(db, id))!.saldo, 25000);
  assert.equal((await obtenerBilletera(db, usd))!.saldo, 35000);

  const movs = await listarMovimientos(db, { metaId: id });
  assert.equal(movs.length, 3);
  assert.equal(movs[0].meta_nombre, 'Viaje');
  const aporteBs = movs.find((m) => m.billetera_origen_id === bs)!;
  assert.equal(aporteBs.tasa_cambio, 950);

  await assert.rejects(
    moverFondosMeta(db, { tipo: 'RETIRO_META', meta_id: id, billetera_id: usd, monto: 30000, fecha: hoy }),
    ErrorValidacion,
  );
  await assert.rejects(
    moverFondosMeta(db, { tipo: 'APORTE_META', meta_id: id, billetera_id: bs, monto: 100, fecha: hoy }),
    /equivalente/,
  );
});

test('metas: validación, edición y eliminación segura', async () => {
  const db = await crearBdMemoria();
  const usd = await crearBilletera(db, { nombre: 'Efectivo', moneda: 'USD', balance_inicial: 50000, icono: 'cash', color_hex: '#000' });
  await assert.rejects(crearMeta(db, { ...viaje, nombre: ' ' }), ErrorValidacion);
  await assert.rejects(crearMeta(db, { ...viaje, monto_objetivo: 0 }), ErrorValidacion);
  await assert.rejects(crearMeta(db, { ...viaje, fecha_objetivo: 'pronto' }), ErrorValidacion);

  const vacia = await crearMeta(db, viaje);
  assert.equal(await eliminarMeta(db, vacia), 'eliminada');

  const id = await crearMeta(db, viaje);
  const aporte = await moverFondosMeta(db, { tipo: 'APORTE_META', meta_id: id, billetera_id: usd, monto: 10000, fecha: hoy });
  await assert.rejects(actualizarMeta(db, id, { ...viaje, moneda: 'BS' }), ErrorValidacion);
  await actualizarMeta(db, id, { ...viaje, nombre: 'Vacaciones' });
  await assert.rejects(eliminarMeta(db, id), /Retira/);

  const retiro = await moverFondosMeta(db, { tipo: 'RETIRO_META', meta_id: id, billetera_id: usd, monto: 10000, fecha: hoy });
  // Borrar el aporte dejaría la meta en negativo.
  await assert.rejects(eliminarMovimiento(db, aporte), ErrorValidacion);
  await eliminarMovimiento(db, retiro);
  await eliminarMovimiento(db, aporte);
  assert.equal((await obtenerMeta(db, id))!.saldo, 0);

  await moverFondosMeta(db, { tipo: 'APORTE_META', meta_id: id, billetera_id: usd, monto: 100, fecha: hoy });
  await moverFondosMeta(db, { tipo: 'RETIRO_META', meta_id: id, billetera_id: usd, monto: 100, fecha: hoy });
  assert.equal(await eliminarMeta(db, id), 'archivada');
  assert.equal((await listarMetas(db)).length, 0);
  await assert.rejects(
    moverFondosMeta(db, { tipo: 'APORTE_META', meta_id: id, billetera_id: usd, monto: 100, fecha: hoy }),
    /archivada/,
  );
});
