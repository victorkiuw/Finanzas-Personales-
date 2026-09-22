import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  crearBilletera,
  ErrorValidacion,
  establecerArchivada,
  obtenerBilletera,
  type DatosBilletera,
} from '../src/db/billeteras';
import { listarCategorias } from '../src/db/categorias';
import {
  actualizarMovimiento,
  crearMovimiento,
  efectoEnBilletera,
  eliminarMovimiento,
  listarMovimientos,
  obtenerMovimiento,
  type DatosMovimiento,
} from '../src/db/movimientos';
import type { Moneda } from '../src/lib/moneda';
import { calcularTasa, parsearTasa, recibidoConTasa, tasaATexto } from '../src/lib/tasa';
import { crearBdMemoria } from './bd-memoria';

const base: Omit<DatosBilletera, 'nombre' | 'moneda'> = {
  balance_inicial: 0,
  icono: 'wallet',
  color_hex: '#000000',
};

async function preparar() {
  const db = await crearBdMemoria();
  const nueva = (nombre: string, moneda: Moneda, balance_inicial = 0) =>
    crearBilletera(db, { ...base, nombre, moneda, balance_inicial });
  const usd = await nueva('Efectivo', 'USD', 10000);
  const bs = await nueva('Banco', 'BS');
  const usdt = await nueva('Binance', 'USDT', 5000);
  const [comida] = await listarCategorias(db, 'GASTO');
  const [salario] = await listarCategorias(db, 'INGRESO');
  const saldo = async (id: number) => (await obtenerBilletera(db, id))!.saldo;
  return { db, usd, bs, usdt, comida, salario, saldo };
}

const ahora = '2026-09-22T12:00:00.000Z';

test('gasto e ingreso ajustan el saldo', async () => {
  const { db, usd, comida, salario, saldo } = await preparar();
  await crearMovimiento(db, { tipo: 'GASTO', monto: 2500, fecha: ahora, billetera_origen_id: usd, categoria_id: comida.id });
  await crearMovimiento(db, { tipo: 'INGRESO', monto: 50000, fecha: ahora, billetera_origen_id: usd, categoria_id: salario.id, nota: '  quincena ' });
  assert.equal(await saldo(usd), 10000 - 2500 + 50000);
  const [ultimo] = await listarMovimientos(db);
  assert.equal(ultimo.nota, 'quincena');
  assert.equal(ultimo.categoria_nombre, salario.nombre);
});

test('transferencia entre monedas guarda la tasa en Bs por unidad', async () => {
  const { db, bs, usdt, saldo } = await preparar();
  // Vende 20 USDT y recibe 3.000 Bs. (tasa 150).
  const id = await crearMovimiento(db, {
    tipo: 'TRANSFERENCIA', monto: 2000, fecha: ahora, billetera_origen_id: usdt,
    billetera_destino_id: bs, monto_destino: 300000,
  });
  assert.equal(await saldo(usdt), 3000);
  assert.equal(await saldo(bs), 300000);
  const m = (await obtenerMovimiento(db, id))!;
  assert.equal(m.tasa_cambio, 150);
  assert.equal(m.categoria_id, null);
  assert.equal(efectoEnBilletera(m, usdt), -2000);
  assert.equal(efectoEnBilletera(m, bs), 300000);

  // Compra: 1.500 Bs. → 10 USDT también es tasa 150.
  const id2 = await crearMovimiento(db, {
    tipo: 'TRANSFERENCIA', monto: 150000, fecha: ahora, billetera_origen_id: bs,
    billetera_destino_id: usdt, monto_destino: 1000,
  });
  assert.equal((await obtenerMovimiento(db, id2))!.tasa_cambio, 150);
});

test('transferencia en la misma moneda ignora monto_destino', async () => {
  const { db, usd, saldo } = await preparar();
  const otra = await crearBilletera(db, { ...base, nombre: 'Caja fuerte', moneda: 'USD' });
  await crearMovimiento(db, {
    tipo: 'TRANSFERENCIA', monto: 4000, fecha: ahora, billetera_origen_id: usd,
    billetera_destino_id: otra, monto_destino: 999,
  });
  assert.equal(await saldo(usd), 6000);
  assert.equal(await saldo(otra), 4000);
});

test('validaciones', async () => {
  const { db, usd, bs, comida, salario } = await preparar();
  const gasto: DatosMovimiento = { tipo: 'GASTO', monto: 100, fecha: ahora, billetera_origen_id: usd, categoria_id: comida.id };
  const casos: DatosMovimiento[] = [
    { ...gasto, monto: 0 },
    { ...gasto, monto: 1.5 },
    { ...gasto, fecha: 'ayer' },
    { ...gasto, categoria_id: null },
    { ...gasto, categoria_id: salario.id },
    { ...gasto, billetera_origen_id: 999 },
    { ...gasto, nota: 'x'.repeat(201) },
    { tipo: 'TRANSFERENCIA', monto: 100, fecha: ahora, billetera_origen_id: usd },
    { tipo: 'TRANSFERENCIA', monto: 100, fecha: ahora, billetera_origen_id: usd, billetera_destino_id: usd },
    { tipo: 'TRANSFERENCIA', monto: 100, fecha: ahora, billetera_origen_id: usd, billetera_destino_id: bs },
  ];
  for (const c of casos) await assert.rejects(crearMovimiento(db, c), ErrorValidacion, JSON.stringify(c));
});

test('billeteras archivadas: no se usan en nuevos, pero se conservan al editar', async () => {
  const { db, usd, comida } = await preparar();
  const gasto: DatosMovimiento = { tipo: 'GASTO', monto: 100, fecha: ahora, billetera_origen_id: usd, categoria_id: comida.id };
  const id = await crearMovimiento(db, gasto);
  await establecerArchivada(db, usd, true);
  await assert.rejects(crearMovimiento(db, gasto), ErrorValidacion);
  await actualizarMovimiento(db, id, { ...gasto, monto: 300 });
  assert.equal((await obtenerMovimiento(db, id))!.monto, 300);
});

test('editar cambia el tipo y limpia campos que ya no aplican', async () => {
  const { db, usd, bs, comida, saldo } = await preparar();
  const id = await crearMovimiento(db, {
    tipo: 'TRANSFERENCIA', monto: 1000, fecha: ahora, billetera_origen_id: usd,
    billetera_destino_id: bs, monto_destino: 150000,
  });
  await actualizarMovimiento(db, id, { tipo: 'GASTO', monto: 1000, fecha: ahora, billetera_origen_id: usd, categoria_id: comida.id, billetera_destino_id: bs });
  const m = (await obtenerMovimiento(db, id))!;
  assert.equal(m.billetera_destino_id, null);
  assert.equal(m.monto_destino, null);
  assert.equal(await saldo(bs), 0);

  await eliminarMovimiento(db, id);
  assert.equal(await saldo(usd), 10000);
});

test('listado filtra por billetera, categoría y fechas, y pagina', async () => {
  const { db, usd, bs, usdt, comida } = await preparar();
  for (let i = 1; i <= 5; i++) {
    await crearMovimiento(db, {
      tipo: 'GASTO', monto: i, fecha: `2026-09-0${i}T12:00:00.000Z`, billetera_origen_id: usd, categoria_id: comida.id,
    });
  }
  await crearMovimiento(db, {
    tipo: 'TRANSFERENCIA', monto: 100, fecha: '2026-08-15T00:00:00.000Z', billetera_origen_id: usdt,
    billetera_destino_id: bs, monto_destino: 15000,
  });

  assert.deepEqual((await listarMovimientos(db, { billeteraId: usd })).map((m) => m.monto), [5, 4, 3, 2, 1]);
  assert.equal((await listarMovimientos(db, { billeteraId: bs })).length, 1);
  assert.equal((await listarMovimientos(db, { categoriaId: comida.id })).length, 5);
  assert.equal(
    (await listarMovimientos(db, { desde: '2026-09-02T00:00:00.000Z', hasta: '2026-09-04T00:00:00.000Z' })).length,
    2,
  );
  const pagina2 = await listarMovimientos(db, { limite: 2, desplazamiento: 2 });
  assert.deepEqual(pagina2.map((m) => m.monto), [3, 2]);
});

test('tasa: cálculo, inversa y parseo', () => {
  assert.equal(calcularTasa('USD', 'BS', 100, 15000), 150);
  assert.equal(calcularTasa('BS', 'USDT', 15000, 100), 150);
  assert.equal(calcularTasa('USD', 'USDT', 10000, 9900), 0.99);
  assert.equal(recibidoConTasa('USD', 'BS', 100, 150), 15000);
  assert.equal(recibidoConTasa('BS', 'USD', 15000, 150), 100);
  assert.equal(parsearTasa('150,25'), 150.25);
  assert.equal(parsearTasa('0'), null);
  assert.equal(parsearTasa('abc'), null);
});

test('tasaATexto se puede volver a parsear', () => {
  assert.equal(tasaATexto(150), '150');
  assert.equal(tasaATexto(150.256), '150,26');
  assert.equal(tasaATexto(0.99851), '0,9985');
  for (const t of [150, 36.5, 0.9985]) assert.equal(parsearTasa(tasaATexto(t)), t);
});
