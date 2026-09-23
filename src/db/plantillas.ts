import { ErrorValidacion } from './billeteras';
import { crearMovimiento } from './movimientos';
import type { BaseDatos } from './tipos';
import type { Moneda } from '../lib/moneda';

/*
 * Movimientos rápidos ("Pasaje", "Almuerzo", "Recarga"): un toque registra el
 * gasto o ingreso con la billetera, categoría y monto guardados. Si no tienen
 * monto, abren el formulario ya lleno para escribirlo.
 */

export interface Plantilla {
  id: number;
  nombre: string;
  tipo: 'GASTO' | 'INGRESO';
  monto: number | null;
  billetera_id: number;
  categoria_id: number;
  icono: string;
  billetera_nombre: string;
  billetera_moneda: Moneda;
}

export interface DatosPlantilla {
  nombre: string;
  tipo: 'GASTO' | 'INGRESO';
  monto: number | null;
  billetera_id: number;
  categoria_id: number;
  icono?: string;
}

export async function listarPlantillas(db: BaseDatos): Promise<Plantilla[]> {
  return db.getAllAsync<Plantilla>(
    `SELECT p.*, b.nombre AS billetera_nombre, b.moneda AS billetera_moneda
     FROM plantillas p JOIN billeteras b ON b.id = p.billetera_id
     WHERE b.archivada = 0 ORDER BY p.nombre`,
    [],
  );
}

export async function crearPlantilla(db: BaseDatos, d: DatosPlantilla): Promise<number> {
  const nombre = d.nombre.trim();
  if (!nombre) throw new ErrorValidacion('Ponle un nombre al movimiento rápido.');
  if (nombre.length > 24) throw new ErrorValidacion('Usa un nombre corto (máximo 24 letras).');
  if (d.monto !== null && (!Number.isSafeInteger(d.monto) || d.monto <= 0)) throw new ErrorValidacion('El monto no es válido.');
  const cat = await db.getFirstAsync<{ tipo: string; icono: string }>(`SELECT tipo, icono FROM categorias WHERE id = ?`, [d.categoria_id]);
  if (!cat || cat.tipo !== d.tipo) throw new ErrorValidacion('Elige una categoría del tipo correcto.');
  const r = await db.runAsync(
    `INSERT INTO plantillas (nombre, tipo, monto, billetera_id, categoria_id, icono) VALUES (?, ?, ?, ?, ?, ?)`,
    [nombre, d.tipo, d.monto, d.billetera_id, d.categoria_id, d.icono ?? cat.icono],
  );
  return r.lastInsertRowId;
}

export async function eliminarPlantilla(db: BaseDatos, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM plantillas WHERE id = ?`, [id]);
}

/** Registra el movimiento de la plantilla (con otro monto si se indica). */
export async function usarPlantilla(db: BaseDatos, p: Plantilla, monto?: number, ahora = new Date()): Promise<number> {
  const m = monto ?? p.monto;
  if (!m) throw new ErrorValidacion('Indica el monto.');
  return crearMovimiento(db, {
    tipo: p.tipo,
    monto: m,
    fecha: ahora.toISOString(),
    billetera_origen_id: p.billetera_id,
    categoria_id: p.categoria_id,
    nota: p.nombre,
  });
}
