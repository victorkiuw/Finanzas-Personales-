import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Conversor, type FilaReporte } from '../src/db/reportes';
import { extraerEtiquetas, fijosVariables, gastosHormiga, pronosticoMes, totalesPorEtiqueta, variacion } from '../src/lib/analisis';

const fila = (p: Partial<FilaReporte>): FilaReporte => ({
  fecha: '2026-10-05T12:00:00.000Z',
  tipo: 'GASTO',
  monto: 100,
  moneda: 'USD',
  categoria_id: 1,
  categoria_nombre: 'Comida',
  categoria_icono: 'food',
  categoria_color: '#000000',
  ...p,
});

test('pronóstico del mes', () => {
  // 10 de un mes de 31 días: $100 gastados → $10/día; faltan 21 días → $210 más.
  const p = pronosticoMes(10000, 50000, new Date(2026, 9, 10));
  assert.equal(p.porDia, 1000);
  assert.equal(p.diasRestantes, 21);
  assert.equal(p.finDeMes, 50000 - 21000);
  assert.equal(p.maximoPorDia, Math.round(50000 / 22));
});

test('variación, hormiga, fijos y etiquetas', () => {
  assert.equal(variacion(123, 100), 23);
  assert.equal(variacion(50, 0), null);
  const c = new Conversor([], 1000);
  const filas = [
    fila({ monto: 150, nota: 'refresco #antojo' }),
    fila({ monto: 200, nota: 'chuchería #Antojo #playa' }),
    fila({ monto: 5000, categoria_nombre: 'Hogar', categoria_fija: 1 }),
    fila({ monto: 900, categoria_nombre: 'Ocio' }),
    fila({ tipo: 'INGRESO', monto: 3000, nota: 'venta #playa' }),
  ];
  const h = gastosHormiga(filas, c, 'USD', 300);
  assert.equal(h.cantidad, 2);
  assert.equal(h.total, 350);
  assert.deepEqual(fijosVariables(filas, c, 'USD'), { fijos: 5000, variables: 1250 });
  assert.deepEqual(extraerEtiquetas('Cena #Cumpleaños de #ana y #ana'), ['#cumpleaños', '#ana']);
  const t = totalesPorEtiqueta(filas, c, 'USD');
  const antojo = t.find((x) => x.etiqueta === '#antojo')!;
  assert.equal(antojo.gastos, 350);
  const playa = t.find((x) => x.etiqueta === '#playa')!;
  assert.deepEqual([playa.gastos, playa.ingresos, playa.cantidad], [200, 3000, 2]);
});
