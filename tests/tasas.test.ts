import assert from 'node:assert/strict';
import { test } from 'node:test';

import { guardarPreferencia, leerPreferencia } from '../src/db/preferencias';
import { actualizarTasasDesdeApi, cambioDe, guardarHistorial, tasaDelDia, euroSegun, guardarTasa, obtenerTasas, tasasVencidas } from '../src/db/tasas';
import { consultarTasas, ErrorTasas, parsearRespuesta, URL_EUROS, URL_TASAS } from '../src/lib/api-tasas';
import { calcularTasa, recibidoConTasa, unidadTasa } from '../src/lib/tasa';
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
    { moneda: 'EUR', fuente: 'paralelo', promedio: 1000 },
    { moneda: 'GBP', fuente: 'oficial', promedio: 1100 },
    { moneda: 'USD', fuente: 'oficial', promedio: null, venta: 850 },
    { fuente: 'bitcoin', promedio: 1 },
    null,
  ]);
  // Del euro solo se toma el oficial del BCV.
  assert.deepEqual(Object.keys(t).sort(), ['BCV', 'EURO']);
  assert.equal(t.BCV?.tasa, 850);
  assert.equal(t.EURO?.tasa, 900);
  assert.throws(() => parsearRespuesta({}), ErrorTasas);
  assert.throws(() => parsearRespuesta([{ fuente: 'oficial', promedio: 0 }]), ErrorTasas);
});

test('consultarTasas maneja éxito, error HTTP, red caída y tiempo de espera', async () => {
  const EUROS = [
    { moneda: 'EUR', fuente: 'oficial', promedio: 978.17, fechaActualizacion: '2026-09-22T00:00:00-04:00' },
    { moneda: 'EUR', fuente: 'paralelo', promedio: 1090.62, fechaActualizacion: '2026-09-22T21:01:15.160Z' },
  ];
  const ok = await consultarTasas(async (url) => {
    assert.ok(url === URL_TASAS || url === URL_EUROS);
    return { ok: true, status: 200, json: async () => (url === URL_EUROS ? EUROS : RESPUESTA) };
  });
  assert.equal(ok.PARALELO?.tasa, 952.36242);
  assert.equal(ok.EURO?.tasa, 978.17);
  // Si solo falla el euro, los dólares llegan igual.
  const sinEuro = await consultarTasas(async (url) =>
    url === URL_EUROS ? { ok: false, status: 500, json: async () => null } : { ok: true, status: 200, json: async () => RESPUESTA },
  );
  assert.deepEqual(Object.keys(sinEuro).sort(), ['BCV', 'PARALELO']);

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

  // Sin el euro se vuelve a consultar enseguida.
  assert.equal(tasasVencidas(await actualizarTasasDesdeApi(db, async () => parsearRespuesta(RESPUESTA))), true);
  const euro = { moneda: 'EUR', fuente: 'oficial', promedio: 978.17, fechaActualizacion: '2026-09-22T00:00:00-04:00' };
  const tasas = await actualizarTasasDesdeApi(db, async () => parsearRespuesta([...RESPUESTA, euro]));
  assert.equal(tasas.BCV?.tasa, 852.4168);
  assert.equal(tasas.PARALELO?.origen, 'API');
  assert.equal(tasas.EURO?.tasa, 978.17);
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
  const cambio = { dolar: 852.42, euro: 978.17 };
  assert.equal(convertir(10000, 'USD', 'BS', cambio), 8524200);
  assert.equal(convertir(8524200, 'BS', 'USDT', cambio), 10000);
  assert.equal(convertir(500, 'USDT', 'USD', { dolar: null, euro: null }), 500);
  // €100 = Bs. 97.817 = $114,75.
  assert.equal(convertir(10000, 'EUR', 'BS', cambio), 9781700);
  assert.equal(convertir(10000, 'EUR', 'USD', cambio), 11475);
  assert.equal(convertir(11475, 'USDT', 'EUR', cambio), 10000);
  assert.equal(convertir(10000, 'EUR', 'BS', { dolar: 852.42, euro: null }), null);
  const saldos = [
    { moneda: 'USD' as const, saldo: 10000 },
    { moneda: 'USDT' as const, saldo: 5000 },
    { moneda: 'BS' as const, saldo: 950000 },
  ];
  assert.equal(totalConsolidado(saldos, 'USD', { dolar: 950, euro: null }), 16000);
  assert.equal(totalConsolidado(saldos, 'BS', { dolar: 950, euro: null }), 15200000);
  assert.equal(totalConsolidado(saldos, 'USD', { dolar: null, euro: null }), null);
  // Sin bolívares no hace falta tasa.
  assert.equal(totalConsolidado(saldos.slice(0, 2), 'USD', { dolar: null, euro: null }), 15000);
  assert.equal(Math.round(brecha(852.42, 952.36) * 10) / 10, 11.7);
});

test('euro: tasa según la referencia y convención de tasas con euros', () => {
  // Con BCV es el euro BCV; con USDT se mantiene la relación euro/dólar del BCV.
  assert.equal(euroSegun(852.42, 852.42, 978.17), 978.17);
  assert.equal(Math.round(euroSegun(953.25, 852.42, 978.17)! * 100) / 100, 1093.87);
  assert.equal(euroSegun(953.25, null, 978.17), null);
  const tasas = {
    BCV: { par: 'BCV' as const, tasa: 850, ultima_actualizacion: '', consultada_en: null, origen: 'API' as const },
    PARALELO: { par: 'PARALELO' as const, tasa: 950, ultima_actualizacion: '', consultada_en: null, origen: 'API' as const },
    EURO: { par: 'EURO' as const, tasa: 1020, ultima_actualizacion: '', consultada_en: null, origen: 'API' as const },
  };
  assert.deepEqual(cambioDe(tasas, 'BCV'), { dolar: 850, euro: 1020 });
  assert.deepEqual(cambioDe(tasas, 'PARALELO'), { dolar: 950, euro: 1140 });

  // Bs. por euro en ambos sentidos; dólares por euro en ambos sentidos.
  assert.equal(calcularTasa('BS', 'EUR', 978170, 1000), 978.17);
  assert.equal(calcularTasa('EUR', 'BS', 1000, 978170), 978.17);
  assert.equal(recibidoConTasa('BS', 'EUR', 978170, 978.17), 1000);
  assert.equal(calcularTasa('EUR', 'USD', 10000, 11500), 1.15);
  assert.equal(calcularTasa('USDT', 'EUR', 11500, 10000), 1.15);
  assert.equal(recibidoConTasa('USD', 'EUR', 11500, 1.15), 10000);
  assert.equal(unidadTasa('EUR', 'USD'), 'USD por €');
  assert.equal(unidadTasa('USD', 'EUR'), 'USD por €');
  assert.equal(unidadTasa('EUR', 'BS'), 'Bs. por €');
  // Entre USD y USDT sigue siendo destino por origen.
  assert.equal(calcularTasa('USD', 'USDT', 10000, 9950), 0.995);
});

test('tasa de un día: la de ese día o la última anterior (fines de semana)', async () => {
  const db = await crearBdMemoria();
  await guardarHistorial(db, [
    { par: 'BCV', dia: '2026-09-11', tasa: 840 },
    { par: 'BCV', dia: '2026-09-14', tasa: 845 },
    { par: 'PARALELO', dia: '2026-09-13', tasa: 940 },
  ]);
  assert.equal(await tasaDelDia(db, 'BCV', '2026-09-14'), 845);
  assert.equal(await tasaDelDia(db, 'BCV', '2026-09-13'), 840); // domingo: la del viernes
  assert.equal(await tasaDelDia(db, 'PARALELO', '2026-09-15'), 940);
  assert.equal(await tasaDelDia(db, 'BCV', '2026-01-01'), null);
});

test('calculadora: cada moneda con su propia tasa', async () => {
  const { convertirNatural } = await import('../src/lib/conversion');
  const t = { bcv: 852.42, usdt: 953.25, euro: 978.17 };
  // Bs. 15.500: dólares a BCV, USDT a tasa USDT, euros a euro BCV.
  assert.equal(convertirNatural(1550000, 'BS', 'USD', t), 1818);
  assert.equal(convertirNatural(1550000, 'BS', 'USDT', t), 1626);
  assert.equal(convertirNatural(1550000, 'BS', 'EUR', t), 1585);
  // 100 USDT = Bs. 95.325; $100 = 100 USDT; €100 = $114,75.
  assert.equal(convertirNatural(10000, 'USDT', 'BS', t), 9532500);
  assert.equal(convertirNatural(10000, 'USD', 'USDT', t), 10000);
  assert.equal(convertirNatural(10000, 'EUR', 'USDT', t), 11475);
  assert.equal(convertirNatural(10000, 'EUR', 'BS', { ...t, euro: null }), null);
});
