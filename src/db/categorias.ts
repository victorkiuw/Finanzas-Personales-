import { ErrorValidacion } from './billeteras';
import type { BaseDatos } from './tipos';

export type TipoCategoria = 'GASTO' | 'INGRESO';

export interface Categoria {
  id: number;
  nombre: string;
  tipo: TipoCategoria;
  color_hex: string;
  icono: string;
  archivada: boolean;
}

export interface DatosCategoria {
  nombre: string;
  tipo: TipoCategoria;
  color_hex: string;
  icono: string;
}

export const LARGO_MAXIMO_NOMBRE_CATEGORIA = 30;

/** Categoría a la que van las comisiones bancarias automáticas. */
export const NOMBRE_CATEGORIA_COMISIONES = 'Comisiones';

type FilaCategoria = Omit<Categoria, 'archivada'> & { archivada: number };
const aCategoria = (f: FilaCategoria): Categoria => ({ ...f, archivada: f.archivada === 1 });

export async function listarCategorias(
  db: BaseDatos,
  tipo?: TipoCategoria,
  { incluirArchivadas = false }: { incluirArchivadas?: boolean } = {},
): Promise<Categoria[]> {
  const condiciones = [tipo ? 'tipo = ?' : null, incluirArchivadas ? null : 'archivada = 0'].filter(Boolean);
  const filas = await db.getAllAsync<FilaCategoria>(
    `SELECT id, nombre, tipo, color_hex, icono, archivada FROM categorias
     ${condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : ''}
     ORDER BY archivada, tipo, nombre COLLATE NOCASE`,
    tipo ? [tipo] : [],
  );
  return filas.map(aCategoria);
}

export async function obtenerCategoria(db: BaseDatos, id: number): Promise<Categoria | null> {
  const f = await db.getFirstAsync<FilaCategoria>(
    `SELECT id, nombre, tipo, color_hex, icono, archivada FROM categorias WHERE id = ?`,
    [id],
  );
  return f ? aCategoria(f) : null;
}

export async function contarUsosCategoria(db: BaseDatos, id: number): Promise<number> {
  const f = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM transacciones WHERE categoria_id = ?`, [id]);
  return f?.n ?? 0;
}

async function validar(db: BaseDatos, d: DatosCategoria, id?: number): Promise<DatosCategoria> {
  const nombre = d.nombre.trim();
  if (!nombre) throw new ErrorValidacion('El nombre es obligatorio.');
  if (nombre.length > LARGO_MAXIMO_NOMBRE_CATEGORIA) {
    throw new ErrorValidacion(`El nombre no puede superar ${LARGO_MAXIMO_NOMBRE_CATEGORIA} caracteres.`);
  }
  if (d.tipo !== 'GASTO' && d.tipo !== 'INGRESO') throw new ErrorValidacion('Tipo inválido.');
  if (!/^#[0-9a-fA-F]{6}$/.test(d.color_hex)) throw new ErrorValidacion('Color inválido.');
  if (!d.icono) throw new ErrorValidacion('Elige un icono.');
  const repetida = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM categorias WHERE nombre = ? COLLATE NOCASE AND tipo = ? AND id <> ?`,
    [nombre, d.tipo, id ?? -1],
  );
  if (repetida) throw new ErrorValidacion(`Ya existe una categoría de ${d.tipo === 'GASTO' ? 'gasto' : 'ingreso'} con ese nombre.`);
  return { ...d, nombre };
}

export async function crearCategoria(db: BaseDatos, datos: DatosCategoria): Promise<number> {
  const d = await validar(db, datos);
  const r = await db.runAsync(`INSERT INTO categorias (nombre, tipo, color_hex, icono) VALUES (?, ?, ?, ?)`, [
    d.nombre,
    d.tipo,
    d.color_hex,
    d.icono,
  ]);
  return r.lastInsertRowId;
}

/** El tipo solo puede cambiar si la categoría no se ha usado (un gasto no puede pasar a ingreso). */
export async function actualizarCategoria(db: BaseDatos, id: number, datos: DatosCategoria): Promise<void> {
  const actual = await obtenerCategoria(db, id);
  if (!actual) throw new ErrorValidacion('La categoría no existe.');
  const d = await validar(db, datos, id);
  if (d.tipo !== actual.tipo && (await contarUsosCategoria(db, id)) > 0) {
    throw new ErrorValidacion('No se puede cambiar el tipo de una categoría con movimientos.');
  }
  await db.runAsync(`UPDATE categorias SET nombre = ?, tipo = ?, color_hex = ?, icono = ? WHERE id = ?`, [
    d.nombre,
    d.tipo,
    d.color_hex,
    d.icono,
    id,
  ]);
}

export async function establecerCategoriaArchivada(db: BaseDatos, id: number, archivada: boolean): Promise<void> {
  await db.runAsync(`UPDATE categorias SET archivada = ? WHERE id = ?`, [archivada ? 1 : 0, id]);
}

/** Elimina si no tiene movimientos; si los tiene, la archiva para no perder el historial. */
export async function eliminarCategoria(db: BaseDatos, id: number): Promise<'eliminada' | 'archivada'> {
  if ((await contarUsosCategoria(db, id)) > 0) {
    await establecerCategoriaArchivada(db, id, true);
    return 'archivada';
  }
  await db.runAsync(`DELETE FROM categorias WHERE id = ?`, [id]);
  return 'eliminada';
}

/** Id de la categoría de comisiones; la crea (o la reactiva) si hace falta. */
export async function categoriaComisiones(db: BaseDatos): Promise<number> {
  const f = await db.getFirstAsync<{ id: number; archivada: number }>(
    `SELECT id, archivada FROM categorias WHERE nombre = ? COLLATE NOCASE AND tipo = 'GASTO'`,
    [NOMBRE_CATEGORIA_COMISIONES],
  );
  if (f) {
    if (f.archivada) await establecerCategoriaArchivada(db, f.id, false);
    return f.id;
  }
  const r = await db.runAsync(`INSERT INTO categorias (nombre, tipo, color_hex, icono) VALUES (?, 'GASTO', ?, ?)`, [
    NOMBRE_CATEGORIA_COMISIONES,
    '#546E7A',
    'bank-transfer',
  ]);
  return r.lastInsertRowId;
}
