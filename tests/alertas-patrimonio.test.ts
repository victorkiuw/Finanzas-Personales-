import assert from 'node:assert/strict';
import { test } from 'node:test';

import { actualizarBilletera, crearBilletera, obtenerBilletera } from '../src/db/billeteras';
import { listarCategorias } from '../src/db/categorias';
import { crearMeta, moverFondosMeta } from '../src/db/metas';
import { crearMovimiento } from '../src/db/movimientos';
import { Conversor, patrimonioPorMes } from '../src/db/reportes';
import { evaluarAlertas } from '../src/lib/alertas';
import { crearBdMemoria } from './bd-memoria';

test('alertas de tasa: subida del paralelo y brecha', () => {
  const config = { subidaParalelo: 3, brechaMaxima: 15 };
  assert.deepEqual(evaluarAlertas({ bcv: 850, paralelo: 952 }, 950, config), []);
  const [subida] = evaluarAlertas({ bcv: 850, paralelo: 980 }, 950, config);
  assert.match(subida, /subió 3,2 %/);
  const brecha = evaluarAlertas({ bcv: 800, paralelo: 952 }, 950, config);
  assert.equal(brecha.length, 1);
  assert.match(brecha[0], /brecha .* 19,0 %/);
  assert.deepEqual(evaluarAlertas({ bcv: 800, paralelo: 1100 }, 950, { subidaParalelo: null, brechaMaxima: null }), []);
  assert.deepEqual(evaluarAlertas({ paralelo: 1100 }, null, config), []);
});

test('disponible por mes: billeteras que cuentan, sin metas ni billeteras aparte, con euros', async () => {
  const db = await crearBdMemoria();
  const base = { icono: 'wallet', color_hex: '#000000' };
  const usd = await crearBilletera(db, { ...base, nombre: 'Efectivo', moneda: 'USD', balance_inicial: 10000 });
  const bs = await crearBilletera(db, { ...base, nombre: 'Banco', moneda: 'BS', balance_inicial: 1000000 });
  const [comida] = await listarCategorias(db, 'GASTO');
  const [salario] = await listarCategorias(db, 'INGRESO');
  const julio = new Date(2026, 6, 15, 12).toISOString();
  const agosto = new Date(2026, 7, 15, 12).toISOString();
  await crearMovimiento(db, { tipo: 'INGRESO', monto: 5000, fecha: julio, billetera_origen_id: usd, categoria_id: salario.id });
  await crearMovimiento(db, { tipo: 'GASTO', monto: 500000, fecha: agosto, billetera_origen_id: bs, categoria_id: comida.id });
  // Una transferencia y un aporte a meta no cambian el patrimonio.
  await crearMovimiento(db, { tipo: 'TRANSFERENCIA', monto: 1000, fecha: agosto, billetera_origen_id: usd, billetera_destino_id: bs, monto_destino: 200000 });
  const meta = await crearMeta(db, { nombre: 'X', monto_objetivo: 100, moneda: 'USD', fecha_objetivo: null, color_hex: '#000000' });
  await moverFondosMeta(db, { tipo: 'APORTE_META', meta_id: meta, billetera_id: usd, monto: 2000, fecha: agosto });

  // Binance guardado aparte: no cuenta. Una cuenta en euros sí, con el euro BCV del día.
  const aparte = await crearBilletera(db, { ...base, nombre: 'Binance', moneda: 'USDT', balance_inicial: 99900, en_total: false });
  await crearBilletera(db, { ...base, nombre: 'Euros', moneda: 'EUR', balance_inicial: 1000 });

  const dolar = [{ dia: '2026-06-01', tasa: 100 }, { dia: '2026-08-01', tasa: 200 }];
  const euro = { euro: [{ dia: '2026-06-01', tasa: 120 }, { dia: '2026-08-01', tasa: 240 }], bcv: dolar };
  const conv = new Conversor(dolar, null, euro, null);
  const puntos = await patrimonioPorMes(db, ['2026-06', '2026-07', '2026-08'], conv, 'USD');
  assert.deepEqual(puntos.map((p) => p.total), [
    10000 + 10000 + 1200, // $100 + Bs. 10.000 a 100 + €10 a 1,2 $/€
    15000 + 10000 + 1200, // +$50 de sueldo
    // USD: 150 - 10 - 20 = 130 - ... = 120 (la meta no cuenta); Bs: 7.000 a 200 = $35; €10 = $12
    12000 + 3500 + 1200,
  ]);

  // Al volver a contar Binance, entra en todos los meses.
  const b = (await obtenerBilletera(db, aparte))!;
  await actualizarBilletera(db, aparte, { ...b, en_total: true });
  const conBinance = await patrimonioPorMes(db, ['2026-06'], conv, 'USD');
  assert.equal(conBinance[0].total, 10000 + 10000 + 1200 + 99900);
});

test('alinearHistoriales rellena días sin cotización', async () => {
  const { alinearHistoriales } = await import('../src/db/tasas');
  const bcv = [
    { dia: '2026-09-18', tasa: 849 },
    { dia: '2026-09-21', tasa: 850 },
  ];
  const paralelo = [
    { dia: '2026-09-19', tasa: 950 },
    { dia: '2026-09-20', tasa: 951 },
    { dia: '2026-09-21', tasa: 952 },
  ];
  const r = alinearHistoriales([bcv, paralelo], '2026-09-19');
  assert.deepEqual(r.dias, ['2026-09-19', '2026-09-20', '2026-09-21']);
  assert.deepEqual(r.valores, [
    [849, 849, 850],
    [950, 951, 952],
  ]);
});

test('pérdida por devaluación de los bolívares', async () => {
  const { perdidaPorDevaluacion } = await import('../src/db/reportes');
  const db = await crearBdMemoria();
  const base = { icono: 'wallet', color_hex: '#000000' };
  await crearBilletera(db, { ...base, nombre: 'Banco', moneda: 'BS', balance_inicial: 1000000 });
  // Bs. 10.000 todo el mes; la tasa pasa de 100 a 125: valían $100 y ahora $80.
  const historial = [
    { dia: '2026-08-31', tasa: 100 },
    { dia: '2026-09-10', tasa: 110 },
    { dia: '2026-09-20', tasa: 125 },
  ];
  const r = await perdidaPorDevaluacion(db, historial, new Date(2026, 8, 1), new Date(2026, 9, 1));
  assert.equal(r.perdida, 2000);
  assert.equal(Math.round(r.subida!), 25);
  assert.equal(r.saldoBs, 1000000);
});
