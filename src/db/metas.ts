import { esMoneda, type Moneda } from '../lib/moneda';
import { calcularTasa } from '../lib/tasa';
import { ErrorValidacion } from './billeteras';
import type { BaseDatos } from './tipos';

export interface Meta {
  id: number;
  nombre: string;
  /** Céntimos en la moneda de la meta. */
  monto_objetivo: number;
  moneda: Moneda;
  /** "AAAA-MM-DD" o null. */
  fecha_objetivo: string | null;
  color_hex: string;
  archivada: boolean;
  /** Céntimos acumulados: aportes menos retiros. */
  saldo: number;
}

export interface DatosMeta {
  nombre: string;
  monto_objetivo: number;
  moneda: Moneda;
  fecha_objetivo: string | null;
  color_hex: string;
}

export const LARGO_MAXIMO_NOMBRE_META = 40;

const SELECT_META = `
  SELECT m.id, m.nombre, m.monto_objetivo, m.moneda, m.fecha_objetivo, m.color_hex, m.archivada,
    COALESCE((
      SELECT SUM(CASE WHEN t.tipo = 'APORTE_META' THEN t.monto_destino ELSE -t.monto_destino END)
      FROM transacciones t WHERE t.meta_id = m.id), 0) AS saldo
  FROM metas_ahorro m`;

type FilaMeta = Omit<Meta, 'archivada'> & { archivada: number };

const aMeta = (f: FilaMeta): Meta => ({ ...f, archivada: f.archivada === 1 });

function validar(d: DatosMeta): DatosMeta {
  const nombre = d.nombre.trim();
  if (!nombre) throw new ErrorValidacion('El nombre es obligatorio.');
  if (nombre.length > LARGO_MAXIMO_NOMBRE_META) {
    throw new ErrorValidacion(`El nombre no puede superar ${LARGO_MAXIMO_NOMBRE_META} caracteres.`);
  }
  if (!esMoneda(d.moneda)) throw new ErrorValidacion('Moneda inválida.');
  if (!Number.isSafeInteger(d.monto_objetivo) || d.monto_objetivo <= 0) {
    throw new ErrorValidacion('El monto objetivo debe ser mayor que cero.');
  }
  if (d.fecha_objetivo !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_objetivo)) {
    throw new ErrorValidacion('La fecha objetivo no es válida.');
  }
  return { ...d, nombre };
}

export async function listarMetas(
  db: BaseDatos,
  { incluirArchivadas = false }: { incluirArchivadas?: boolean } = {},
): Promise<Meta[]> {
  const filas = await db.getAllAsync<FilaMeta>(
    `${SELECT_META} ${incluirArchivadas ? '' : 'WHERE m.archivada = 0'} ORDER BY m.archivada, m.id`,
    [],
  );
  return filas.map(aMeta);
}

export async function obtenerMeta(db: BaseDatos, id: number): Promise<Meta | null> {
  const f = await db.getFirstAsync<FilaMeta>(`${SELECT_META} WHERE m.id = ?`, [id]);
  return f ? aMeta(f) : null;
}

export async function crearMeta(db: BaseDatos, datos: DatosMeta): Promise<number> {
  const d = validar(datos);
  const r = await db.runAsync(
    `INSERT INTO metas_ahorro (nombre, monto_objetivo, moneda, fecha_objetivo, color_hex) VALUES (?, ?, ?, ?, ?)`,
    [d.nombre, d.monto_objetivo, d.moneda, d.fecha_objetivo, d.color_hex],
  );
  return r.lastInsertRowId;
}

async function contarMovimientosMeta(db: BaseDatos, id: number): Promise<number> {
  const f = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM transacciones WHERE meta_id = ?`, [id]);
  return f?.n ?? 0;
}

export async function actualizarMeta(db: BaseDatos, id: number, datos: DatosMeta): Promise<void> {
  const d = validar(datos);
  const actual = await obtenerMeta(db, id);
  if (!actual) throw new ErrorValidacion('La meta no existe.');
  if (actual.moneda !== d.moneda && (await contarMovimientosMeta(db, id)) > 0) {
    throw new ErrorValidacion('No se puede cambiar la moneda de una meta con aportes.');
  }
  await db.runAsync(
    `UPDATE metas_ahorro SET nombre = ?, monto_objetivo = ?, moneda = ?, fecha_objetivo = ?, color_hex = ? WHERE id = ?`,
    [d.nombre, d.monto_objetivo, d.moneda, d.fecha_objetivo, d.color_hex, id],
  );
}

export async function establecerMetaArchivada(db: BaseDatos, id: number, archivada: boolean): Promise<void> {
  await db.runAsync(`UPDATE metas_ahorro SET archivada = ? WHERE id = ?`, [archivada ? 1 : 0, id]);
}

/**
 * Una meta con dinero no se puede eliminar ni archivar: primero hay que
 * retirarlo a una billetera. Si tiene historial pero saldo cero, se archiva.
 */
export async function eliminarMeta(db: BaseDatos, id: number): Promise<'eliminada' | 'archivada'> {
  const meta = await obtenerMeta(db, id);
  if (!meta) throw new ErrorValidacion('La meta no existe.');
  if (meta.saldo !== 0) throw new ErrorValidacion('Retira el dinero de la meta antes de eliminarla.');
  if ((await contarMovimientosMeta(db, id)) > 0) {
    await establecerMetaArchivada(db, id, true);
    return 'archivada';
  }
  await db.runAsync(`DELETE FROM metas_ahorro WHERE id = ?`, [id]);
  return 'eliminada';
}

export interface DatosMovimientoMeta {
  tipo: 'APORTE_META' | 'RETIRO_META';
  meta_id: number;
  billetera_id: number;
  /** Céntimos en la moneda de la billetera. */
  monto: number;
  /** Céntimos en la moneda de la meta (se ignora si ambas monedas coinciden). */
  monto_meta?: number | null;
  fecha: string;
  nota?: string | null;
}

/** Aporta dinero de una billetera a la meta, o lo retira de la meta a una billetera. */
export async function moverFondosMeta(db: BaseDatos, d: DatosMovimientoMeta): Promise<number> {
  const meta = await obtenerMeta(db, d.meta_id);
  if (!meta) throw new ErrorValidacion('La meta no existe.');
  if (meta.archivada) throw new ErrorValidacion('La meta está archivada.');
  const billetera = await db.getFirstAsync<{ moneda: Moneda; archivada: number }>(
    `SELECT moneda, archivada FROM billeteras WHERE id = ?`,
    [d.billetera_id],
  );
  if (!billetera) throw new ErrorValidacion('Elige una billetera.');
  if (billetera.archivada) throw new ErrorValidacion('La billetera está archivada.');
  if (!Number.isSafeInteger(d.monto) || d.monto <= 0) throw new ErrorValidacion('El monto debe ser mayor que cero.');
  if (Number.isNaN(Date.parse(d.fecha))) throw new ErrorValidacion('La fecha no es válida.');

  const mismaMoneda = billetera.moneda === meta.moneda;
  const montoMeta = mismaMoneda ? d.monto : d.monto_meta;
  if (!montoMeta || !Number.isSafeInteger(montoMeta) || montoMeta <= 0) {
    throw new ErrorValidacion(`Indica el equivalente en ${meta.moneda}.`);
  }
  if (d.tipo === 'RETIRO_META' && montoMeta > meta.saldo) {
    throw new ErrorValidacion('No puedes retirar más de lo que tiene la meta.');
  }
  const tasa = mismaMoneda
    ? null
    : d.tipo === 'APORTE_META'
      ? calcularTasa(billetera.moneda, meta.moneda, d.monto, montoMeta)
      : calcularTasa(meta.moneda, billetera.moneda, montoMeta, d.monto);

  const r = await db.runAsync(
    `INSERT INTO transacciones (tipo, monto, fecha, billetera_origen_id, meta_id, monto_destino, tasa_cambio, nota)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.tipo, d.monto, d.fecha, d.billetera_id, d.meta_id, montoMeta, tasa, d.nota?.trim() || null],
  );
  return r.lastInsertRowId;
}
