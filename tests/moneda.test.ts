import assert from 'node:assert/strict';
import { test } from 'node:test';

import { centimosATexto, formatearMonto, parsearMonto } from '../src/lib/moneda';

test('formatea con miles y decimales venezolanos', () => {
  assert.equal(formatearMonto(123456, 'BS'), 'Bs. 1.234,56');
  assert.equal(formatearMonto(100000005, 'USD'), '$1.000.000,05');
  assert.equal(formatearMonto(-2550, 'USD'), '-$25,50');
  assert.equal(formatearMonto(0, 'USDT'), '0,00 USDT');
  assert.equal(formatearMonto(-35000, 'BS'), '-Bs. 350,00');
  assert.equal(formatearMonto(-300, 'USDT'), '-3,00 USDT');
});

test('parsea los formatos habituales', () => {
  assert.equal(parsearMonto('1234.56'), 123456);
  assert.equal(parsearMonto('1234,56'), 123456);
  assert.equal(parsearMonto('1.234,56'), 123456);
  assert.equal(parsearMonto('1,234.56'), 123456);
  assert.equal(parsearMonto('1.234.567'), 123456700);
  assert.equal(parsearMonto('Bs. 50'), 5000);
  assert.equal(parsearMonto('$ 12,5'), 1250);
  assert.equal(parsearMonto('-10'), -1000);
  assert.equal(parsearMonto('0,005'), 1);
  assert.equal(parsearMonto(',5'), 50);
});

test('rechaza texto inválido', () => {
  for (const t of ['', 'abc', '.', '1,2,3.4.5', '1.2,3.4', '--1', '1e5']) {
    assert.equal(parsearMonto(t), null, t);
  }
});

test('centimosATexto es inverso de parsearMonto', () => {
  for (const c of [1, 50, 100, 123456, -2550]) {
    assert.equal(parsearMonto(centimosATexto(c)), c);
  }
  assert.equal(centimosATexto(0), '');
});

test('USD a tasa BCV y USDT a tasa USDT cuando se conocen las dos', async () => {
  const { convertir, totalConsolidado } = await import('../src/lib/conversion');
  const natural = { dolar: 1000, euro: null, bcv: 800, usdt: 1000 };
  // $10 BCV = Bs. 8.000 = 8 USDT; 10 USDT = Bs. 10.000 = $12,50 BCV.
  assert.equal(convertir(1000, 'USD', 'USDT', natural), 800);
  assert.equal(convertir(1000, 'USDT', 'USD', natural), 1250);
  assert.equal(convertir(1000, 'USD', 'BS', natural), 800000);
  assert.equal(convertir(1000000, 'BS', 'USDT', natural), 1000);
  // Sin las dos tasas, 1:1 como antes.
  assert.equal(convertir(1000, 'USD', 'USDT', { dolar: 1000, euro: null }), 1000);
  assert.equal(totalConsolidado([{ moneda: 'USD', saldo: 1000 }, { moneda: 'USDT', saldo: 1000 }], 'USDT', natural), 1800);
});
