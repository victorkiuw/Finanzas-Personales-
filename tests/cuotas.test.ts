import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearBilletera, obtenerBilletera } from '../src/db/billeteras';
import { listarCategorias } from '../src/db/categorias';
import {
  calendario,
  crearCompra,
  eliminarCompra,
  guardarLimite,
  leerLimite,
  listarCompras,
  montosCuotas,
  obtenerCompra,
  pagarCuota,
  resumenCuotas,
  ultimaInicialPct,
} from '../src/db/cuotas';
import { actualizarMovimiento, listarMovimientos } from '../src/db/movimientos';
import { crearBdMemoria } from './bd-memoria';

test('cuotas iguales cada 14 días, la última absorbe el redondeo', () => {
  assert.deepEqual(montosCuotas(1000, 3), [333, 333, 334]);
  const cal = calendario({ total: 6000, inicial: 2400, cuotas: 3, fecha: new Date(2026, 8, 23, 12).toISOString(), dias_entre_cuotas: 14 }, 1200);
  assert.deepEqual(cal.map((c) => [c.fecha, c.monto, c.pagada]), [
    ['2026-10-07', 1200, true],
    ['2026-10-21', 1200, false],
    ['2026-11-04', 1200, false],
  ]);
});

test('compra en Cashea: inicial, pagar cuotas en Bs. y límite de crédito', async () => {
  const db = await crearBdMemoria();
  const base = { icono: 'wallet', color_hex: '#000000' };
  const banco = await crearBilletera(db, { ...base, nombre: 'Mercantil', moneda: 'BS', balance_inicial: 10000000 });
  const efectivo = await crearBilletera(db, { ...base, nombre: 'Efectivo', moneda: 'USD', balance_inicial: 10000 });
  const [salud] = await listarCategorias(db, 'GASTO');
  const fecha = new Date(2026, 8, 23, 12).toISOString();

  // $60 con 40 % de inicial ($24) pagada con Bs. 20.460 → $36 en 3 cuotas de $12.
  const id = await crearCompra(db, {
    comercio: 'Farmatodo', total: 6000, inicial: 2400, cuotas: 3, fecha, categoria_id: salud.id, billetera_id: banco, monto_billetera: 2046000,
  });
  let c = (await obtenerCompra(db, id))!;
  assert.equal(c.pendiente, 3600);
  assert.equal(c.proxima?.monto, 1200);
  assert.equal((await obtenerBilletera(db, banco))!.saldo, 10000000 - 2046000);
  assert.equal(await ultimaInicialPct(db), 40);

  // Primera cuota en bolívares a 853,50; la segunda en efectivo.
  await pagarCuota(db, { compra_id: id, billetera_id: banco, monto_billetera: 1024200, fecha });
  await pagarCuota(db, { compra_id: id, billetera_id: efectivo, fecha });
  c = (await obtenerCompra(db, id))!;
  assert.equal(c.pendiente, 1200);
  assert.deepEqual(c.calendario.map((q) => q.pagada), [true, true, false]);
  assert.equal((await obtenerBilletera(db, efectivo))!.saldo, 10000 - 1200);
  await assert.rejects(pagarCuota(db, { compra_id: id, billetera_id: efectivo, usd: 5000, fecha }), /más de lo que falta/);

  // Los pagos son gastos de su categoría, pero no se editan como un movimiento suelto.
  const pagos = await listarMovimientos(db, { billeteraId: efectivo });
  assert.equal(pagos[0].compra_comercio, 'Farmatodo');
  assert.equal(pagos[0].categoria_id, salud.id);
  await assert.rejects(
    actualizarMovimiento(db, pagos[0].id, { tipo: 'GASTO', monto: 1, fecha, billetera_origen_id: efectivo, categoria_id: salud.id }),
    /cuotas/,
  );

  // Límite de crédito.
  assert.equal(await leerLimite(db), null);
  await guardarLimite(db, 30000);
  const r = resumenCuotas(await listarCompras(db), await leerLimite(db));
  assert.deepEqual([r.usado, r.limite, r.disponible], [1200, 30000, 28800]);
  assert.equal(r.proxima?.comercio, 'Farmatodo');
  assert.equal(r.proxima?.cuota.fecha, '2026-11-04');

  await pagarCuota(db, { compra_id: id, billetera_id: efectivo, fecha });
  assert.equal((await obtenerCompra(db, id))!.proxima, null);
  await assert.rejects(pagarCuota(db, { compra_id: id, billetera_id: efectivo, fecha }), /ya está pagada/);

  // Al borrar la compra se borran sus pagos y los saldos vuelven.
  await eliminarCompra(db, id);
  assert.equal((await obtenerBilletera(db, banco))!.saldo, 10000000);
  assert.equal((await obtenerBilletera(db, efectivo))!.saldo, 10000);
});

test('validaciones de compras a cuotas', async () => {
  const db = await crearBdMemoria();
  const [cat] = await listarCategorias(db, 'GASTO');
  const base = { comercio: 'X', total: 1000, inicial: 0, cuotas: 3, fecha: new Date().toISOString(), categoria_id: cat.id };
  await assert.rejects(crearCompra(db, { ...base, comercio: ' ' }), /dónde/);
  await assert.rejects(crearCompra(db, { ...base, inicial: 1000 }), /inicial/);
  await assert.rejects(crearCompra(db, { ...base, cuotas: 0 }), /cuotas/);
  const usd = await crearBilletera(db, { icono: 'x', color_hex: '#000', nombre: 'Bs', moneda: 'BS', balance_inicial: 0 });
  await assert.rejects(crearCompra(db, { ...base, inicial: 100, billetera_id: usd }), /cuánto salió/);
});

test('la comisión del Pago Móvil se registra aparte al pagar la inicial y las cuotas', async () => {
  const db = await crearBdMemoria();
  const banco = await crearBilletera(db, { icono: 'wallet', color_hex: '#000000', nombre: 'Mercantil', moneda: 'BS', balance_inicial: 10000000 });
  const saldo = async (id: number) => (await obtenerBilletera(db, id))!.saldo;
  const cat = (await listarCategorias(db, 'GASTO'))[0].id;
  // Inicial $10 = Bs. 5.000 a 500; comisión Bs. 75.
  const id = await crearCompra(db, {
    comercio: 'Tienda', total: 4000, inicial: 1000, cuotas: 3, fecha: '2026-09-01T12:00:00.000Z', categoria_id: cat,
    billetera_id: banco, monto_billetera: 500000, comision: 7500,
  });
  assert.equal(await saldo(banco), 10000000 - 500000 - 7500);
  await pagarCuota(db, { compra_id: id, billetera_id: banco, monto_billetera: 500000, fecha: '2026-09-15T12:00:00.000Z', comision: 7500 });
  assert.equal(await saldo(banco), 10000000 - 2 * (500000 + 7500));
  // La comisión no cuenta como abono a la compra.
  assert.equal((await obtenerCompra(db, id))!.pendiente, 2000);
  await eliminarCompra(db, id);
  assert.equal(await saldo(banco), 10000000);
});
