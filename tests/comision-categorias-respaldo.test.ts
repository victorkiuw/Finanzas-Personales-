import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearBilletera, ErrorValidacion, obtenerBilletera } from '../src/db/billeteras';
import {
  actualizarCategoria,
  categoriaComisiones,
  crearCategoria,
  eliminarCategoria,
  listarCategorias,
} from '../src/db/categorias';
import { crearMeta, moverFondosMeta } from '../src/db/metas';
import {
  actualizarMovimiento,
  crearMovimiento,
  eliminarMovimiento,
  listarMovimientos,
  obtenerMovimiento,
  type DatosMovimiento,
} from '../src/db/movimientos';
import { ErrorRespaldo, exportarDatos, importarDatos, validarRespaldo } from '../src/db/respaldo';
import { calcularComision, PRESETS_COMISION } from '../src/lib/comision';
import { crearBdMemoria } from './bd-memoria';

const hoy = '2026-09-22T12:00:00.000Z';
const P2P = PRESETS_COMISION[1].config;

test('comisión de Pago Móvil: 0,3 % con mínimo de Bs. 14', () => {
  assert.equal(calcularComision(100000, P2P), 1400); // Bs. 1.000 → 3 Bs., aplica el mínimo
  assert.equal(calcularComision(1000000, P2P), 3000); // Bs. 10.000 → Bs. 30
  assert.equal(calcularComision(1000000, { porcentaje: 0, minima: 0 }), 0);
  assert.equal(calcularComision(0, P2P), 0);
});

async function preparar() {
  const db = await crearBdMemoria();
  const banco = await crearBilletera(db, {
    nombre: 'Banco', moneda: 'BS', balance_inicial: 10000000, icono: 'bank', color_hex: '#000000',
    comision_porcentaje: 0.3, comision_minima: 1400,
  });
  const otra = await crearBilletera(db, { nombre: 'Otro banco', moneda: 'BS', balance_inicial: 0, icono: 'bank', color_hex: '#000000' });
  const [comida] = await listarCategorias(db, 'GASTO');
  const gasto: DatosMovimiento = { tipo: 'GASTO', monto: 1000000, fecha: hoy, billetera_origen_id: banco, categoria_id: comida.id };
  return { db, banco, otra, comida, gasto };
}

test('la comisión se guarda como gasto vinculado y se borra con el movimiento', async () => {
  const { db, banco, gasto } = await preparar();
  assert.equal((await obtenerBilletera(db, banco))!.comision_minima, 1400);
  const id = await crearMovimiento(db, { ...gasto, comision: 3000 });
  const saldo = async () => (await obtenerBilletera(db, banco))!.saldo;
  assert.equal(await saldo(), 10000000 - 1000000 - 3000);

  const m = (await obtenerMovimiento(db, id))!;
  assert.equal(m.comision, 3000);
  const hijo = (await listarMovimientos(db)).find((x) => x.comision_de === id)!;
  assert.equal(hijo.categoria_nombre, 'Comisiones');
  assert.equal(hijo.monto, 3000);

  // Editar sin indicar la comisión la conserva; con 0 la quita; con otro monto la cambia.
  await actualizarMovimiento(db, id, { ...gasto, monto: 2000000 });
  assert.equal((await obtenerMovimiento(db, id))!.comision, 3000);
  await actualizarMovimiento(db, id, { ...gasto, monto: 2000000, comision: 6000 });
  assert.equal(await saldo(), 10000000 - 2000000 - 6000);
  await actualizarMovimiento(db, id, { ...gasto, comision: 0 });
  assert.equal((await obtenerMovimiento(db, id))!.comision, null);

  await actualizarMovimiento(db, id, { ...gasto, comision: 3000 });
  await eliminarMovimiento(db, id);
  assert.equal(await saldo(), 10000000);
  assert.equal((await listarMovimientos(db)).length, 0);
});

test('transferencias también llevan comisión; los ingresos no', async () => {
  const { db, banco, otra } = await preparar();
  const [salario] = await listarCategorias(db, 'INGRESO');
  await crearMovimiento(db, {
    tipo: 'TRANSFERENCIA', monto: 500000, fecha: hoy, billetera_origen_id: banco, billetera_destino_id: otra, comision: 1500,
  });
  assert.equal((await obtenerBilletera(db, banco))!.saldo, 10000000 - 500000 - 1500);
  await assert.rejects(
    crearMovimiento(db, { tipo: 'INGRESO', monto: 100, fecha: hoy, billetera_origen_id: banco, categoria_id: salario.id, comision: 1400 }),
    ErrorValidacion,
  );
});

test('la categoría de comisiones se recrea si el usuario la borró', async () => {
  const { db, gasto } = await preparar();
  const original = await categoriaComisiones(db);
  assert.equal(await eliminarCategoria(db, original), 'eliminada');
  const id = await crearMovimiento(db, { ...gasto, comision: 1400 });
  const hijo = (await listarMovimientos(db)).find((x) => x.comision_de === id)!;
  assert.equal(hijo.categoria_nombre, 'Comisiones');
});

test('categorías: crear, editar, no duplicar y archivar si están en uso', async () => {
  const { db, comida, gasto } = await preparar();
  const id = await crearCategoria(db, { nombre: 'Mascotas', tipo: 'GASTO', color_hex: '#123456', icono: 'paw' });
  await assert.rejects(crearCategoria(db, { nombre: 'mascotas', tipo: 'GASTO', color_hex: '#123456', icono: 'paw' }), /Ya existe/);
  // Mismo nombre en ingresos sí se permite.
  await crearCategoria(db, { nombre: 'Mascotas', tipo: 'INGRESO', color_hex: '#123456', icono: 'paw' });
  await assert.rejects(crearCategoria(db, { nombre: ' ', tipo: 'GASTO', color_hex: '#123456', icono: 'paw' }), ErrorValidacion);
  await assert.rejects(crearCategoria(db, { nombre: 'X', tipo: 'GASTO', color_hex: 'rojo', icono: 'paw' }), ErrorValidacion);

  await actualizarCategoria(db, id, { nombre: 'Perrito', tipo: 'INGRESO', color_hex: '#654321', icono: 'dog' });
  await actualizarCategoria(db, id, { nombre: 'Perrito', tipo: 'GASTO', color_hex: '#654321', icono: 'dog' });

  await crearMovimiento(db, gasto);
  await assert.rejects(actualizarCategoria(db, comida.id, { ...comida, tipo: 'INGRESO' }), /tipo/);
  assert.equal(await eliminarCategoria(db, comida.id), 'archivada');
  assert.equal((await listarCategorias(db, 'GASTO')).some((c) => c.id === comida.id), false);
  assert.equal((await listarCategorias(db, 'GASTO', { incluirArchivadas: true })).some((c) => c.id === comida.id), true);
  assert.equal(await eliminarCategoria(db, id), 'eliminada');
});

test('respaldo: exportar e importar deja los mismos datos', async () => {
  const { db, banco, gasto } = await preparar();
  await crearMovimiento(db, { ...gasto, comision: 3000 });
  const meta = await crearMeta(db, { nombre: 'Viaje', monto_objetivo: 100000, moneda: 'BS', fecha_objetivo: null, color_hex: '#000000' });
  await moverFondosMeta(db, { tipo: 'APORTE_META', meta_id: meta, billetera_id: banco, monto: 50000, fecha: hoy });
  const copia = JSON.parse(JSON.stringify(await exportarDatos(db)));

  const destino = await crearBdMemoria();
  await crearBilletera(destino, { nombre: 'Se borra', moneda: 'USD', balance_inicial: 1, icono: 'cash', color_hex: '#000000' });
  await importarDatos(destino, validarRespaldo(copia));
  assert.deepEqual(JSON.parse(JSON.stringify(await exportarDatos(destino, new Date(copia.exportado_en)))), copia);
  assert.equal((await obtenerBilletera(destino, banco))!.saldo, 10000000 - 1000000 - 3000 - 50000);

  // Tras importar se pueden seguir creando registros sin chocar ids.
  await crearMovimiento(destino, gasto);
});

test('respaldo: rechaza archivos ajenos o de versiones futuras, e importa copias viejas', async () => {
  assert.throws(() => validarRespaldo({ hola: 1 }), ErrorRespaldo);
  assert.throws(() => validarRespaldo({ app: 'finanzas-personales', version: 999, tablas: {} }), /más nueva/);
  assert.throws(() => validarRespaldo({ app: 'finanzas-personales', version: 1, tablas: { billeteras: 'x' } }), /dañada/);

  // Una copia de la versión 1 no tenía columnas de comisión: se usan los valores por defecto.
  const db = await crearBdMemoria();
  await importarDatos(
    db,
    validarRespaldo({
      app: 'finanzas-personales',
      version: 1,
      exportado_en: hoy,
      tablas: {
        billeteras: [{ id: 7, nombre: 'Vieja', moneda: 'USD', balance_inicial: 500, icono: 'cash', color_hex: '#000000', archivada: 0, creada_en: hoy }],
        categorias: [{ id: 1, nombre: 'Comida', tipo: 'GASTO', color_hex: '#000000', icono: 'food' }],
      },
    }),
  );
  const b = (await obtenerBilletera(db, 7))!;
  assert.equal(b.saldo, 500);
  assert.equal(b.comision_porcentaje, 0);
  assert.equal((await listarCategorias(db)).length, 1);
});
