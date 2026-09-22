import assert from 'node:assert/strict';
import { test } from 'node:test';

import { guardarPreferencia, leerPreferencia } from '../src/db/preferencias';
import { actualizarTasasDesdeApi, guardarTasa, obtenerTasas, tasasVencidas } from '../src/db/tasas';
import { consultarTasas, ErrorTasas, parsearRespuesta, URL_TASAS } from '../src/lib/api-tasas';
import { brecha, convertir, totalConsolidado } from '../src/lib/conversion';
import { crearBdMemoria } from './bd-memoria';

// Copia de una respuesta real de ve.dolarapi.com/v1/dolares.
const RESPUESTA = [
  {
    moneda: 'USD', fuente: 'oficial', nombre: 'Dólar', compra: null, venta: null,
    promedio: 852.4168, fechaActualizacion: '2026-09-22T00:00:00-04:00',
  },
  {
    moneda: 'USD', fuente: 'paralelo', nombre: 'Paralelo', compra: null, venta: null,
    promedio: 952.36242, fechaActualizacion: '2026-09-22T20:01:15.941Z',
  },
];

test('parsea la respuesta de DolarApi', () => {
  const t = parsearRespuesta(RESPUESTA);
  assert.equal(t.BCV?.tasa, 852.4168);
  assert.equal(t.BCV?.fecha, '2026-09-22T04:00:00.000Z');
  assert.equal(t.PARALELO?.tasa, 952.36242);
});

test('ignora entradas raras y falla si no queda ninguna tasa', () => {
  const t = parsearRespuesta([
    { moneda: 'EUR', fuente: 'oficial', promedio: 900 },
    { moneda: 'USD', fuente: 'oficial', promedio: null, venta: 850 },
    { fuente: 'bitcoin', promedio: 1 },
    null,
  ]);
  assert.deepEqual(Object.keys(t), ['BCV']);
  assert.equal(t.BCV?.tasa, 850);
  assert.throws(() => parsearRespuesta({}), ErrorTasas);
  assert.throws(() => parsearRespuesta([{ fuente: 'oficial', promedio: 0 }]), ErrorTasas);
});

test('consultarTasas maneja éxito, error HTTP, red caída y tiempo de espera', async () => {
  const ok = await consultarTasas(async (url) => {
    assert.equal(url, URL_TASAS);
    return { ok: true, status: 200, json: async () => RESPUESTA };
  });
  assert.equal(ok.PARALELO?.tasa, 952.36242);

  await assert.rejects(consultarTasas(async () => ({ ok: false, status: 503, json: async () => null })), /503/);
  await assert.rejects(
    consultarTasas(async () => {
      throw new TypeError('Network request failed');
    }),
    /Sin conexión/,
  );
  await assert.rejects(
    consultarTasas(
      (_url, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')))),
      20,
    ),
    /tiempo de espera/,
  );
});

test('caché: guarda, actualiza y conserva la última tasa si la API falla', async () => {
  const db = await crearBdMemoria();
  assert.deepEqual(await obtenerTasas(db), {});
  assert.equal(tasasVencidas({}), true);

  const tasas = await actualizarTasasDesdeApi(db, async () => parsearRespuesta(RESPUESTA));
  assert.equal(tasas.BCV?.tasa, 852.4168);
  assert.equal(tasas.PARALELO?.origen, 'API');
  assert.equal(tasasVencidas(tasas), false);

  await assert.rejects(
    actualizarTasasDesdeApi(db, async () => {
      throw new ErrorTasas('Sin conexión.');
    }),
  );
  assert.equal((await obtenerTasas(db)).BCV?.tasa, 852.4168);

  await guardarTasa(db, 'PARALELO', { tasa: 1000, fecha: new Date().toISOString() }, 'MANUAL');
  const manual = (await obtenerTasas(db)).PARALELO!;
  assert.equal(manual.tasa, 1000);
  assert.equal(manual.origen, 'MANUAL');

  const enUnaHora = new Date(Date.now() + 60 * 60_000);
  assert.equal(tasasVencidas(await obtenerTasas(db), enUnaHora), true);
});

test('preferencias', async () => {
  const db = await crearBdMemoria();
  assert.equal(await leerPreferencia(db, 'x'), null);
  await guardarPreferencia(db, 'x', 'BS');
  await guardarPreferencia(db, 'x', 'USD');
  assert.equal(await leerPreferencia(db, 'x'), 'USD');
});

test('conversión y total consolidado', () => {
  assert.equal(convertir(10000, 'USD', 'BS', 852.42), 8524200);
  assert.equal(convertir(8524200, 'BS', 'USDT', 852.42), 10000);
  assert.equal(convertir(500, 'USDT', 'USD', 852.42), 500);
  const saldos = [
    { moneda: 'USD' as const, saldo: 10000 },
    { moneda: 'USDT' as const, saldo: 5000 },
    { moneda: 'BS' as const, saldo: 950000 },
  ];
  assert.equal(totalConsolidado(saldos, 'USD', 950), 16000);
  assert.equal(totalConsolidado(saldos, 'BS', 950), 15200000);
  assert.equal(Math.round(brecha(852.42, 952.36) * 10) / 10, 11.7);
});
