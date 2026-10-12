import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearDeseo, deseoAMeta, listarDeseos, marcarComprado, semanasParaLlegar } from '../src/db/deseos';
import { listarMetas } from '../src/db/metas';
import { rachaSinGastar, totalReto52 } from '../src/db/retos';
import { proximosEventos } from '../src/lib/proximos';
import { crearBdMemoria } from './bd-memoria';

test('lista de deseos y convertir en meta', async () => {
  const db = await crearBdMemoria();
  await assert.rejects(crearDeseo(db, { nombre: ' ', precio: 100, moneda: 'USD' }), /qué quieres/);
  const id = await crearDeseo(db, { nombre: 'Audífonos', precio: 4500, moneda: 'USD' });
  await crearDeseo(db, { nombre: 'Zapatos', precio: 3000, moneda: 'USD' });
  await marcarComprado(db, id, true);
  const lista = await listarDeseos(db);
  assert.deepEqual(lista.map((d) => [d.nombre, d.comprado]), [['Zapatos', false], ['Audífonos', true]]);
  await deseoAMeta(db, lista[0]);
  assert.equal((await listarDeseos(db)).length, 1);
  assert.equal((await listarMetas(db))[0].monto_objetivo, 3000);
  assert.equal(semanasParaLlegar(1000, 300), 4);
  assert.equal(semanasParaLlegar(1000, 0), null);
});

test('racha sin gastar y reto de 52 semanas', () => {
  const conGasto = new Set(['2026-10-01', '2026-10-05']);
  const r = rachaSinGastar(conGasto, new Date(2026, 9, 1), new Date(2026, 9, 9, 15));
  assert.deepEqual(r, { actual: 4, mejor: 4 }); // 6, 7, 8 y 9
  assert.deepEqual(totalReto52({ base: 100, moneda: 'USD', marcadas: [1, 2, 3] }), { ahorrado: 600, meta: 137800 });
});

test('lo que viene: recurrentes repetidos, cuotas y deudas con fecha', () => {
  const eventos = proximosEventos(
    {
      recurrentes: [
        {
          id: 1, nombre: 'Internet', tipo: 'GASTO', monto: 2000, billetera_id: 1, categoria_id: 1, meta_id: null, frecuencia: 'SEMANAL',
          dia_ancla: 1, proxima_fecha: '2026-10-08', automatico: false, activo: true, billetera_nombre: 'Banco', billetera_moneda: 'BS',
          categoria_icono: 'wifi', categoria_color: '#000000',
        },
      ],
      compras: [],
      deudas: [],
      metas: [],
    },
    '2026-10-10',
    '2026-10-25',
  );
  // La atrasada (8) se muestra hoy y luego cada semana: 15 y 22.
  assert.deepEqual(eventos.map((e) => e.fecha), ['2026-10-10', '2026-10-15', '2026-10-22']);
});
