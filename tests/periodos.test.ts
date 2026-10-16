import assert from 'node:assert/strict';
import { test } from 'node:test';

import { totalesPorPeriodo, Conversor } from '../src/db/reportes';
import { periodos } from '../src/lib/periodos';

test('periodos por día, semana (lunes a domingo) y mes', () => {
  const fin = new Date(2026, 8, 23, 15); // miércoles 23 sep 2026
  const dias = periodos('dia', fin, 7);
  assert.equal(dias.length, 7);
  assert.equal(dias[6].corta, 'mié 23');
  assert.equal(dias[0].larga, 'jue 17 sep');
  assert.equal(dias[6].hasta.getTime(), new Date(2026, 8, 24).getTime());

  const semanas = periodos('semana', fin, 6);
  assert.equal(semanas[5].desde.getTime(), new Date(2026, 8, 21).getTime()); // lunes 21
  assert.equal(semanas[5].larga, 'Semana del 21 sep');
  assert.equal(semanas[0].corta, '17/8');

  const meses = periodos('mes', fin, 6);
  assert.deepEqual(meses.map((m) => m.corta), ['abr', 'may', 'jun', 'jul', 'ago', 'sep']);
  assert.equal(meses[5].larga, 'sep 2026');
});

test('ingresos y gastos por periodo', () => {
  const fin = new Date(2026, 8, 23, 15);
  const fila = (fecha: Date, tipo: 'GASTO' | 'INGRESO', monto: number) => ({
    fecha: fecha.toISOString(), tipo, monto, moneda: 'USD' as const,
    categoria_id: 1, categoria_nombre: 'x', categoria_icono: 'x', categoria_color: '#000',
  });
  const filas = [
    fila(new Date(2026, 8, 23, 10), 'GASTO', 500),
    fila(new Date(2026, 8, 22, 23, 59), 'INGRESO', 2000),
    fila(new Date(2026, 8, 1), 'GASTO', 100), // fuera de los 7 días
  ];
  const t = totalesPorPeriodo(filas, new Conversor([], 100), 'USD', periodos('dia', fin, 7));
  assert.deepEqual(t.slice(5).map((x) => [x.ingresos, x.gastos]), [[2000, 0], [0, 500]]);
  assert.equal(t.reduce((s, x) => s + x.gastos, 0), 500);
});
