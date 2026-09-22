import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearBilletera, ErrorValidacion, obtenerBilletera } from '../src/db/billeteras';
import {
  crearDeuda,
  eliminarDeuda,
  listarDeudas,
  obtenerDeuda,
  registrarPagoDeuda,
  resumenDeudas,
} from '../src/db/deudas';
import { listarMovimientos } from '../src/db/movimientos';
import { exportarDatos, importarDatos, validarRespaldo } from '../src/db/respaldo';
import { crearBdMemoria } from './bd-memoria';

const hoy = '2026-09-22T12:00:00.000Z';

async function preparar() {
  const db = await crearBdMemoria();
  const base = { icono: 'wallet', color_hex: '#000000' };
  const banco = await crearBilletera(db, { ...base, nombre: 'Banco', moneda: 'BS', balance_inicial: 5000000 });
  const efectivo = await crearBilletera(db, { ...base, nombre: 'Efectivo', moneda: 'USD', balance_inicial: 10000 });
  const saldo = async (id: number) => (await obtenerBilletera(db, id))!.saldo;
  return { db, banco, efectivo, saldo };
}

test('préstamo en Bs. indexado al dólar: se cobra a la tasa del día', async () => {
  const { db, banco, efectivo, saldo } = await preparar();
  // Presto Bs. 9.524 valorados a 952,40 Bs./USD = $10.
  const id = await crearDeuda(db, {
    tipo: 'ME_DEBEN', persona: ' Juan ', moneda: 'BS', monto: 952400, tasa_referencia: 952.4, fecha: hoy, billetera_id: banco,
  });
  assert.equal(await saldo(banco), 5000000 - 952400);
  let d = (await obtenerDeuda(db, id))!;
  assert.equal(d.persona, 'Juan');
  assert.equal(d.unidad, 'USD');
  assert.equal(d.total, 1000);
  assert.equal(d.pendiente, 1000);

  // Me paga Bs. 5.500 cuando el dólar está en 1.100 → abona $5.
  await registrarPagoDeuda(db, { deuda_id: id, billetera_id: banco, monto: 550000, monto_unidad: 500, fecha: hoy });
  d = (await obtenerDeuda(db, id))!;
  assert.equal(d.pendiente, 500);
  assert.equal(d.cerrada, false);
  assert.equal(await saldo(banco), 5000000 - 952400 + 550000);

  const cobro = (await listarMovimientos(db, { billeteraId: banco }))[0];
  assert.equal(cobro.tipo, 'COBRO_DEUDA');
  assert.equal(cobro.deuda_persona, 'Juan');
  assert.equal(cobro.tasa_cambio, 1100);

  // El resto lo paga en efectivo en dólares (1:1) y la deuda se cierra sola.
  await registrarPagoDeuda(db, { deuda_id: id, billetera_id: efectivo, monto: 500, fecha: hoy });
  d = (await obtenerDeuda(db, id))!;
  assert.equal(d.pendiente, 0);
  assert.equal(d.cerrada, true);
  await assert.rejects(registrarPagoDeuda(db, { deuda_id: id, billetera_id: efectivo, monto: 1, fecha: hoy }), /cerrada/);
});

test('deuda que debo, sin billetera, y pagos de más', async () => {
  const { db, banco, efectivo, saldo } = await preparar();
  const id = await crearDeuda(db, { tipo: 'DEBO', persona: 'María', moneda: 'USD', monto: 2000, fecha: hoy });
  assert.equal(await saldo(efectivo), 10000); // sin billetera no mueve saldos
  await assert.rejects(
    registrarPagoDeuda(db, { deuda_id: id, billetera_id: efectivo, monto: 3000, fecha: hoy }),
    /mayor que lo pendiente/,
  );
  await registrarPagoDeuda(db, { deuda_id: id, billetera_id: efectivo, monto: 1500, fecha: hoy });
  assert.equal(await saldo(efectivo), 8500);
  // Un pago en Bs. a una deuda en USD necesita el equivalente.
  await assert.rejects(registrarPagoDeuda(db, { deuda_id: id, billetera_id: banco, monto: 100000, fecha: hoy }), /tasa/);
  // Redondeo: pagar 1 % de más salda la deuda sin error.
  await registrarPagoDeuda(db, { deuda_id: id, billetera_id: banco, monto: 480000, monto_unidad: 505, fecha: hoy });
  assert.equal((await obtenerDeuda(db, id))!.cerrada, true);
});

test('validaciones, resumen, eliminar y respaldo', async () => {
  const { db, banco, efectivo, saldo } = await preparar();
  const base = { tipo: 'ME_DEBEN' as const, persona: 'Ana', moneda: 'BS' as const, monto: 100000, fecha: hoy };
  await assert.rejects(crearDeuda(db, { ...base, persona: '' }), ErrorValidacion);
  await assert.rejects(crearDeuda(db, { ...base, monto: 0 }), ErrorValidacion);
  await assert.rejects(crearDeuda(db, { ...base, billetera_id: efectivo }), /misma moneda/);

  const noIndexada = await crearDeuda(db, { ...base, billetera_id: banco });
  assert.equal((await obtenerDeuda(db, noIndexada))!.unidad, 'BS');
  await crearDeuda(db, { tipo: 'DEBO', persona: 'Luis', moneda: 'USDT', monto: 700, fecha: hoy });

  const r = resumenDeudas(await listarDeudas(db), 1000);
  assert.deepEqual(r, { meDeben: 100, debo: 700, completo: true });
  assert.equal(resumenDeudas(await listarDeudas(db), null).completo, false);

  const copia = JSON.parse(JSON.stringify(await exportarDatos(db)));
  const otra = await crearBdMemoria();
  await importarDatos(otra, validarRespaldo(copia));
  assert.equal((await listarDeudas(otra)).length, 2);

  await eliminarDeuda(db, noIndexada);
  assert.equal(await saldo(banco), 5000000);
  assert.equal((await listarDeudas(db)).length, 1);
});
