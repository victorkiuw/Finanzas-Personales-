import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extraerMonto, interpretarDictado } from '../src/lib/dictado';

const billeteras = [
  { id: 1, nombre: 'Efectivo', moneda: 'USD' as const },
  { id: 2, nombre: 'Mercantil', moneda: 'BS' as const },
  { id: 3, nombre: 'Binance', moneda: 'USDT' as const },
  { id: 4, nombre: 'Banca Amiga', moneda: 'BS' as const },
];
const categorias = [
  { id: 10, nombre: 'Comida', tipo: 'GASTO' as const },
  { id: 11, nombre: 'Transporte', tipo: 'GASTO' as const },
  { id: 12, nombre: 'Servicios', tipo: 'GASTO' as const },
  { id: 20, nombre: 'Salario', tipo: 'INGRESO' as const },
];

test('montos dictados', () => {
  assert.equal(extraerMonto('gasté 500 bolívares'), 50000);
  assert.equal(extraerMonto('1.500 en comida'), 150000);
  assert.equal(extraerMonto('20,50 dólares'), 2050);
  assert.equal(extraerMonto('5 mil bolívares'), 500000);
  assert.equal(extraerMonto('$20'), 2000);
  assert.equal(extraerMonto('sin monto'), null);
});

test('interpreta gastos, ingresos, billetera y categoría', () => {
  assert.deepEqual(interpretarDictado('Gasté 500 bolívares en comida con Mercantil', billeteras, categorias), {
    tipo: 'GASTO', monto: 50000, moneda: 'BS', billeteraId: 2, categoriaId: 10, nota: 'Gasté 500 bolívares en comida con Mercantil',
  });
  const pasaje = interpretarDictado('pasaje 300 banca amiga', billeteras, categorias);
  assert.equal(pasaje.categoriaId, 11);
  assert.equal(pasaje.billeteraId, 4);
  const sueldo = interpretarDictado('Me pagaron 200 dólares de sueldo', billeteras, categorias);
  assert.equal(sueldo.tipo, 'INGRESO');
  assert.equal(sueldo.billeteraId, 1);
  assert.equal(sueldo.categoriaId, 20);
  const recarga = interpretarDictado('recarga de 10 usdt', billeteras, categorias);
  assert.equal(recarga.moneda, 'USDT');
  assert.equal(recarga.billeteraId, 3);
  assert.equal(recarga.categoriaId, 12);
  assert.equal(interpretarDictado('cambié 20 dólares a mercantil', billeteras, categorias).tipo, 'TRANSFERENCIA');
});
