import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearBilletera, obtenerBilletera } from '../src/db/billeteras';
import {
  actualizarDeuda,
  ajenoPorBilletera,
  crearDeuda,
  devolverAAjeno,
  eliminarDeuda,
  listarAjustes,
  listarDeudas,
  obtenerDeuda,
  registrarPagoDeuda,
  resumenDeudas,
  tomarPrestadoDeAjeno,
} from '../src/db/deudas';
import { listarMovimientos } from '../src/db/movimientos';
import { exportarDatos, importarDatos } from '../src/db/respaldo';
import { crearBdMemoria } from './bd-memoria';

const hoy = '2026-09-25T12:00:00.000Z';

async function preparar() {
  const db = await crearBdMemoria();
  const base = { icono: 'wallet', color_hex: '#000000' };
  const binance = await crearBilletera(db, { ...base, nombre: 'Binance', moneda: 'USDT', balance_inicial: 20000 });
  const mercantil = await crearBilletera(db, { ...base, nombre: 'Mercantil', moneda: 'BS', balance_inicial: 10000000 });
  const saldo = async (id: number) => (await obtenerBilletera(db, id))!.saldo;
  return { db, binance, mercantil, saldo };
}

test('dinero de otros: no mueve saldos y se resta por billetera', async () => {
  const { db, binance, saldo } = await preparar();
  const id = await crearDeuda(db, {
    tipo: 'DEBO', persona: 'Abuela', moneda: 'USDT', monto: 10000, fecha: hoy, billetera_id: binance, ajeno: true,
  });
  assert.equal(await saldo(binance), 20000);
  const d = (await obtenerDeuda(db, id))!;
  assert.equal(d.ajeno, true);
  assert.equal(d.billetera_id, binance);
  assert.equal(d.billetera_nombre, 'Binance');
  const deudas = await listarDeudas(db);
  assert.equal(ajenoPorBilletera(deudas).get(binance), 10000);
  // No cuenta como una deuda mía en el resumen.
  assert.equal(resumenDeudas(deudas, { dolar: 100, euro: null }).debo, 0);

  // Requiere billetera de la misma moneda.
  await assert.rejects(crearDeuda(db, { tipo: 'DEBO', persona: 'Papá', moneda: 'USDT', monto: 1, fecha: hoy, ajeno: true }), /billetera/);

  // Si me lo acaba de dar, entra a la billetera; editar respeta esa elección.
  const nuevo = await crearDeuda(db, {
    tipo: 'DEBO', persona: 'Papá', moneda: 'USDT', monto: 5000, fecha: hoy, billetera_id: binance, ajeno: true, ya_en_saldo: false,
  });
  assert.equal(await saldo(binance), 25000);
  await actualizarDeuda(db, nuevo, { tipo: 'DEBO', persona: 'Papá', moneda: 'USDT', monto: 6000, fecha: hoy, billetera_id: binance, ajeno: true });
  assert.equal(await saldo(binance), 26000);

  // Entregarle una parte: sale de la billetera y baja lo guardado.
  await registrarPagoDeuda(db, { deuda_id: id, billetera_id: binance, monto: 4000, fecha: hoy });
  assert.equal(await saldo(binance), 22000);
  assert.equal((await obtenerDeuda(db, id))!.pendiente, 6000);
});

test('tomar prestado de lo que guardo y devolverlo con un P2P desde otra billetera', async () => {
  const { db, binance, mercantil, saldo } = await preparar();
  const ajeno = await crearDeuda(db, {
    tipo: 'DEBO', persona: 'Abuela', moneda: 'USDT', monto: 10000, fecha: hoy, billetera_id: binance, ajeno: true,
  });
  await assert.rejects(tomarPrestadoDeAjeno(db, { ajeno_id: ajeno, monto: 20000, fecha: hoy }), /más de lo que/);
  const deuda = await tomarPrestadoDeAjeno(db, { ajeno_id: ajeno, monto: 2000, fecha: hoy });
  assert.equal(await saldo(binance), 20000); // no se mueve nada
  assert.equal((await obtenerDeuda(db, ajeno))!.pendiente, 8000);
  let d = (await obtenerDeuda(db, deuda))!;
  assert.equal(d.tipo, 'DEBO');
  assert.equal(d.persona, 'Abuela');
  assert.equal(d.origen_ajeno_id, ajeno);
  assert.equal(d.pendiente, 2000);
  assert.equal(resumenDeudas(await listarDeudas(db), { dolar: 100, euro: null }).debo, 2000);

  // Devuelvo $15 comprando USDT con Bs. de Mercantil a 1.200.
  await devolverAAjeno(db, { deuda_id: deuda, monto: 1500, desde_billetera_id: mercantil, monto_origen: 1800000, fecha: hoy });
  assert.equal(await saldo(mercantil), 10000000 - 1800000);
  assert.equal(await saldo(binance), 21500);
  assert.equal((await obtenerDeuda(db, ajeno))!.pendiente, 9500);
  d = (await obtenerDeuda(db, deuda))!;
  assert.equal(d.pendiente, 500);
  const t = (await listarMovimientos(db, { billeteraId: mercantil }))[0];
  assert.equal(t.tipo, 'TRANSFERENCIA');
  assert.equal(t.tasa_cambio, 1200);

  // El resto ya lo tenía en Binance: no hay transferencia y la deuda se salda.
  await devolverAAjeno(db, { deuda_id: deuda, monto: 500, desde_billetera_id: binance, fecha: hoy });
  assert.equal(await saldo(binance), 21500);
  assert.equal((await obtenerDeuda(db, ajeno))!.pendiente, 10000);
  assert.equal((await obtenerDeuda(db, deuda))!.cerrada, true);
  assert.equal((await listarAjustes(db, ajeno)).length, 3);

  // Respaldo: los ajustes viajan con la copia.
  const copia = await exportarDatos(db);
  assert.equal(copia.tablas.ajustes_deuda.length, 5);
  await importarDatos(db, copia);
  assert.equal((await obtenerDeuda(db, ajeno))!.pendiente, 10000);

  // Borrar la deuda deshace también su lado en lo guardado.
  await eliminarDeuda(db, deuda);
  assert.equal((await obtenerDeuda(db, ajeno))!.pendiente, 10000);
  assert.equal((await listarAjustes(db, ajeno)).length, 0);
  assert.equal(await saldo(mercantil), 10000000);
});

test('prestado en bolívares y llevado en dólares, editar lo tomado', async () => {
  const { db, mercantil } = await preparar();
  const ajeno = await crearDeuda(db, {
    tipo: 'DEBO', persona: 'Mamá', moneda: 'BS', monto: 5000000, fecha: hoy, billetera_id: mercantil, ajeno: true,
  });
  const deuda = await tomarPrestadoDeAjeno(db, { ajeno_id: ajeno, monto: 1000000, tasa_referencia: 1000, fecha: hoy });
  let d = (await obtenerDeuda(db, deuda))!;
  assert.equal(d.unidad, 'USD');
  assert.equal(d.total, 1000);
  // Devuelvo Bs. 6.000 cuando el dólar está en 1.200: son $5.
  await devolverAAjeno(db, { deuda_id: deuda, monto: 600000, monto_unidad: 500, desde_billetera_id: mercantil, fecha: hoy });
  assert.equal((await obtenerDeuda(db, ajeno))!.pendiente, 5000000 - 1000000 + 600000);
  assert.equal((await obtenerDeuda(db, deuda))!.pendiente, 500);

  // Corregir lo tomado ajusta lo guardado.
  await actualizarDeuda(db, deuda, { tipo: 'DEBO', persona: 'Mamá', moneda: 'BS', monto: 1200000, tasa_referencia: 1000, fecha: hoy });
  d = (await obtenerDeuda(db, deuda))!;
  assert.equal(d.origen_ajeno_id, ajeno);
  assert.equal((await obtenerDeuda(db, ajeno))!.pendiente, 5000000 - 1200000 + 600000);
});

test('la gráfica de disponible no cuenta el dinero de otros', async () => {
  const { db, binance } = await preparar();
  const { Conversor, disponibleAl } = await import('../src/db/reportes');
  const ajeno = await crearDeuda(db, {
    tipo: 'DEBO', persona: 'Abuela', moneda: 'USDT', monto: 10000, fecha: hoy, billetera_id: binance, ajeno: true,
  });
  await tomarPrestadoDeAjeno(db, { ajeno_id: ajeno, monto: 2000, fecha: hoy });
  await registrarPagoDeuda(db, { deuda_id: ajeno, billetera_id: binance, monto: 1000, fecha: hoy });
  const [p] = await disponibleAl(db, [new Date('2026-09-30T00:00:00Z')], new Conversor([], 1000), 'USD');
  // Mercantil Bs. 100.000 a 1.000 = $100; Binance 200 − 10 entregados; de la abuela quedan 70.
  assert.equal(p.total, 10000 + 19000 - 7000);
});
