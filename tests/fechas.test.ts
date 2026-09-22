import assert from 'node:assert/strict';
import { test } from 'node:test';

import { claveDia, formatearDia, haceCuanto, rangoDias, rangoMes } from '../src/lib/fechas';

// Las pruebas se ejecutan con TZ=America/Caracas (ver script "test").

test('formatearDia usa Hoy / Ayer / fecha', () => {
  const hoy = new Date(2026, 8, 22, 10);
  assert.equal(formatearDia(new Date(2026, 8, 22, 23, 59).toISOString(), hoy), 'Hoy');
  assert.equal(formatearDia(new Date(2026, 8, 21, 0, 1).toISOString(), hoy), 'Ayer');
  assert.equal(formatearDia(new Date(2026, 8, 15, 12).toISOString(), hoy), 'mar 15 sep');
  assert.equal(formatearDia(new Date(2025, 11, 31, 12).toISOString(), hoy), 'mié 31 dic 2025');
});

test('claveDia agrupa por día local, no UTC', () => {
  // 22 de septiembre a las 22:00 en Caracas es 23 de septiembre en UTC.
  assert.equal(claveDia(new Date(2026, 8, 22, 22).toISOString()), '2026-09-22');
});

test('rangos de mes y de días', () => {
  const r = rangoMes(new Date(2026, 0, 15), -1);
  assert.equal(r.desde, new Date(2025, 11, 1).toISOString());
  assert.equal(r.hasta, new Date(2026, 0, 1).toISOString());
  const d = rangoDias(new Date(2026, 8, 1, 15), new Date(2026, 8, 3, 8));
  assert.equal(d.desde, new Date(2026, 8, 1).toISOString());
  assert.equal(d.hasta, new Date(2026, 8, 4).toISOString());
});

test('haceCuanto', () => {
  const ahora = new Date(2026, 8, 22, 12, 0);
  const antes = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();
  assert.equal(haceCuanto(antes(0), ahora), 'hace un momento');
  assert.equal(haceCuanto(antes(5), ahora), 'hace 5 min');
  assert.equal(haceCuanto(antes(180), ahora), 'hace 3 h');
  assert.equal(haceCuanto(new Date(2026, 8, 20, 9, 5).toISOString(), ahora), 'el 20 sep 2026 09:05');
});
