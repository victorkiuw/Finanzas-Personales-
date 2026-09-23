import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearBilletera } from '../src/db/billeteras';
import { listarCategorias } from '../src/db/categorias';
import { copiasSobrantes, exportarMovimientosCsv } from '../src/db/exportar';
import { crearMovimiento } from '../src/db/movimientos';
import { crearBdMemoria } from './bd-memoria';

test('CSV para Excel en español: ; separador, coma decimal, BOM y comillas', async () => {
  const db = await crearBdMemoria();
  const base = { icono: 'wallet', color_hex: '#000000', balance_inicial: 0 };
  const usd = await crearBilletera(db, { ...base, nombre: 'Efectivo', moneda: 'USD' });
  const bs = await crearBilletera(db, { ...base, nombre: 'Banco; principal', moneda: 'BS' });
  const [comida] = await listarCategorias(db, 'GASTO');
  await crearMovimiento(db, {
    tipo: 'GASTO', monto: 123456, fecha: new Date(2026, 8, 1, 8, 5).toISOString(), billetera_origen_id: usd,
    categoria_id: comida.id, nota: 'dijo "hola"',
  });
  await crearMovimiento(db, {
    tipo: 'TRANSFERENCIA', monto: 1000, fecha: new Date(2026, 8, 2, 9).toISOString(), billetera_origen_id: usd,
    billetera_destino_id: bs, monto_destino: 952400,
  });
  const { csv, cantidad } = await exportarMovimientosCsv(db);
  assert.equal(cantidad, 2);
  assert.ok(csv.startsWith('﻿Fecha;Hora;Tipo'));
  const lineas = csv.slice(1).split('\r\n');
  assert.equal(lineas[1], `2026-09-01;08:05;Gasto;${comida.nombre};Efectivo;USD;-1234,56;;;;;;"dijo ""hola"""`);
  assert.equal(lineas[2], '2026-09-02;09:00;Transferencia;;Efectivo;USD;-10,00;"Banco; principal";BS;9524,00;952,4;;');
});

test('copias automáticas: se conservan las 7 más recientes', () => {
  const nombres = Array.from({ length: 10 }, (_, i) => `auto-2026-09-${String(i + 1).padStart(2, '0')}.json`);
  assert.deepEqual(copiasSobrantes([...nombres, 'otro.json']), ['auto-2026-09-03.json', 'auto-2026-09-02.json', 'auto-2026-09-01.json']);
  assert.deepEqual(copiasSobrantes(nombres.slice(0, 3)), []);
});
