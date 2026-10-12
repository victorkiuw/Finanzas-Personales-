import { esMoneda, type Moneda } from '../lib/moneda';
import { ErrorValidacion } from './billeteras';
import { crearMeta } from './metas';
import type { BaseDatos } from './tipos';

/** Algo que quiero comprar, con su precio. */
export interface Deseo {
  id: number;
  nombre: string;
  /** Céntimos en `moneda`. */
  precio: number;
  moneda: Moneda;
  comprado: boolean;
  creado_en: string;
}

type Fila = Omit<Deseo, 'comprado'> & { comprado: number };
const aDeseo = (f: Fila): Deseo => ({ ...f, comprado: f.comprado === 1 });

export async function listarDeseos(db: BaseDatos): Promise<Deseo[]> {
  const filas = await db.getAllAsync<Fila>(
    `SELECT id, nombre, precio, moneda, comprado, creado_en FROM deseos ORDER BY comprado, creado_en DESC, id DESC`,
    [],
  );
  return filas.map(aDeseo);
}

function validar(nombre: string, precio: number, moneda: Moneda) {
  const n = nombre.trim();
  if (!n) throw new ErrorValidacion('Escribe qué quieres comprar.');
  if (n.length > 60) throw new ErrorValidacion('El nombre es muy largo.');
  if (!Number.isSafeInteger(precio) || precio <= 0) throw new ErrorValidacion('El precio debe ser mayor que cero.');
  if (!esMoneda(moneda)) throw new ErrorValidacion('Moneda inválida.');
  return n;
}

export async function crearDeseo(db: BaseDatos, d: { nombre: string; precio: number; moneda: Moneda }): Promise<number> {
  const nombre = validar(d.nombre, d.precio, d.moneda);
  const r = await db.runAsync(`INSERT INTO deseos (nombre, precio, moneda) VALUES (?, ?, ?)`, [nombre, d.precio, d.moneda]);
  return r.lastInsertRowId;
}

export async function marcarComprado(db: BaseDatos, id: number, comprado: boolean): Promise<void> {
  await db.runAsync(`UPDATE deseos SET comprado = ? WHERE id = ?`, [comprado ? 1 : 0, id]);
}

export async function eliminarDeseo(db: BaseDatos, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM deseos WHERE id = ?`, [id]);
}

/** Lo convierte en una meta de ahorro (y lo saca de la lista). Devuelve el id de la meta. */
export async function deseoAMeta(db: BaseDatos, deseo: Deseo, color = '#B5E61D'): Promise<number> {
  const id = await crearMeta(db, { nombre: deseo.nombre, monto_objetivo: deseo.precio, moneda: deseo.moneda, fecha_objetivo: null, color_hex: color });
  await eliminarDeseo(db, deseo.id);
  return id;
}

/** Semanas para juntar lo que falta ahorrando `porSemana` (null si no se ahorra). */
export function semanasParaLlegar(falta: number, porSemana: number): number | null {
  if (falta <= 0) return 0;
  if (porSemana <= 0) return null;
  return Math.ceil(falta / porSemana);
}
