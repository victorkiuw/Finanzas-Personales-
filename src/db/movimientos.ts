import type { Moneda } from '../lib/moneda';
import { calcularTasa } from '../lib/tasa';
import { ErrorValidacion } from './billeteras';
import type { BaseDatos, ValorSQL } from './tipos';

/** Tipos que se registran desde el formulario de movimientos (las metas llegan en la fase 4). */
export type TipoMovimiento = 'GASTO' | 'INGRESO' | 'TRANSFERENCIA';

export type TipoTransaccion = TipoMovimiento | 'APORTE_META' | 'RETIRO_META';

export interface DatosMovimiento {
  tipo: TipoMovimiento;
  /** Céntimos en la moneda de la billetera origen. */
  monto: number;
  /** ISO 8601 (UTC). */
  fecha: string;
  billetera_origen_id: number;
  categoria_id?: number | null;
  billetera_destino_id?: number | null;
  /** Céntimos en la moneda de la billetera destino (solo transferencias). */
  monto_destino?: number | null;
  nota?: string | null;
}

export interface Movimiento {
  id: number;
  tipo: TipoTransaccion;
  monto: number;
  fecha: string;
  nota: string | null;
  categoria_id: number | null;
  categoria_nombre: string | null;
  categoria_color: string | null;
  categoria_icono: string | null;
  billetera_origen_id: number;
  origen_nombre: string;
  origen_moneda: Moneda;
  billetera_destino_id: number | null;
  destino_nombre: string | null;
  destino_moneda: Moneda | null;
  monto_destino: number | null;
  tasa_cambio: number | null;
  meta_id: number | null;
}

export interface FiltroMovimientos {
  /** Movimientos donde la billetera es origen o destino. */
  billeteraId?: number;
  categoriaId?: number;
  tipo?: TipoTransaccion;
  /** ISO inclusivo. */
  desde?: string;
  /** ISO exclusivo. */
  hasta?: string;
  limite?: number;
  desplazamiento?: number;
}

export const LARGO_MAXIMO_NOTA = 200;

const SELECT_MOVIMIENTO = `
  SELECT t.id, t.tipo, t.monto, t.fecha, t.nota, t.categoria_id,
    c.nombre AS categoria_nombre, c.color_hex AS categoria_color, c.icono AS categoria_icono,
    t.billetera_origen_id, o.nombre AS origen_nombre, o.moneda AS origen_moneda,
    t.billetera_destino_id, d.nombre AS destino_nombre, d.moneda AS destino_moneda,
    t.monto_destino, t.tasa_cambio, t.meta_id
  FROM transacciones t
  JOIN billeteras o ON o.id = t.billetera_origen_id
  LEFT JOIN billeteras d ON d.id = t.billetera_destino_id
  LEFT JOIN categorias c ON c.id = t.categoria_id`;

interface FilaBilleteraMin {
  id: number;
  moneda: Moneda;
  archivada: number;
}

/** Al editar se permite conservar una billetera que se archivó después. */
async function buscarBilletera(
  db: BaseDatos,
  id: number,
  rol: string,
  permitirArchivada: boolean,
): Promise<FilaBilleteraMin> {
  const b = await db.getFirstAsync<FilaBilleteraMin>(
    `SELECT id, moneda, archivada FROM billeteras WHERE id = ?`,
    [id],
  );
  if (!b) throw new ErrorValidacion(`Elige la billetera ${rol}.`);
  if (b.archivada && !permitirArchivada) throw new ErrorValidacion(`La billetera ${rol} está archivada.`);
  return b;
}

function montoValido(monto: unknown): monto is number {
  return typeof monto === 'number' && Number.isSafeInteger(monto) && monto > 0;
}

/** Normaliza y valida; devuelve los valores listos para guardar. */
async function preparar(db: BaseDatos, d: DatosMovimiento, idActual?: number) {
  if (!['GASTO', 'INGRESO', 'TRANSFERENCIA'].includes(d.tipo)) {
    throw new ErrorValidacion('Tipo de movimiento inválido.');
  }
  if (!montoValido(d.monto)) throw new ErrorValidacion('El monto debe ser mayor que cero.');
  if (Number.isNaN(Date.parse(d.fecha))) throw new ErrorValidacion('La fecha no es válida.');
  const nota = d.nota?.trim() || null;
  if (nota && nota.length > LARGO_MAXIMO_NOTA) {
    throw new ErrorValidacion(`La nota no puede superar ${LARGO_MAXIMO_NOTA} caracteres.`);
  }

  const anterior = idActual !== undefined ? await obtenerMovimiento(db, idActual) : null;
  const verificar = (id: number, rol: string, previa: number | null | undefined) =>
    buscarBilletera(db, id, rol, id === previa);

  const origen = await verificar(
    d.billetera_origen_id,
    d.tipo === 'INGRESO' ? 'de destino' : 'de origen',
    anterior?.billetera_origen_id,
  );

  if (d.tipo === 'TRANSFERENCIA') {
    if (!d.billetera_destino_id) throw new ErrorValidacion('Elige la billetera de destino.');
    if (d.billetera_destino_id === d.billetera_origen_id) {
      throw new ErrorValidacion('El origen y el destino deben ser billeteras distintas.');
    }
    const destino = await verificar(d.billetera_destino_id, 'de destino', anterior?.billetera_destino_id);
    const montoDestino = origen.moneda === destino.moneda ? d.monto : d.monto_destino;
    if (!montoValido(montoDestino)) throw new ErrorValidacion('Indica cuánto se recibió.');
    const tasa =
      origen.moneda === destino.moneda ? null : calcularTasa(origen.moneda, destino.moneda, d.monto, montoDestino);
    return [d.tipo, d.monto, d.fecha, null, d.billetera_origen_id, d.billetera_destino_id, montoDestino, tasa, nota];
  }

  if (!d.categoria_id) throw new ErrorValidacion('Elige una categoría.');
  const cat = await db.getFirstAsync<{ tipo: string }>(`SELECT tipo FROM categorias WHERE id = ?`, [
    d.categoria_id,
  ]);
  if (!cat || cat.tipo !== d.tipo) throw new ErrorValidacion('La categoría no corresponde al tipo.');
  return [d.tipo, d.monto, d.fecha, d.categoria_id, d.billetera_origen_id, null, null, null, nota];
}

export async function crearMovimiento(db: BaseDatos, datos: DatosMovimiento): Promise<number> {
  const valores = await preparar(db, datos);
  const r = await db.runAsync(
    `INSERT INTO transacciones
      (tipo, monto, fecha, categoria_id, billetera_origen_id, billetera_destino_id, monto_destino, tasa_cambio, nota)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    valores,
  );
  return r.lastInsertRowId;
}

export async function actualizarMovimiento(db: BaseDatos, id: number, datos: DatosMovimiento): Promise<void> {
  const actual = await obtenerMovimiento(db, id);
  if (!actual) throw new ErrorValidacion('El movimiento no existe.');
  if (actual.meta_id !== null) {
    throw new ErrorValidacion('Los movimientos de metas se editan desde el módulo de ahorros.');
  }
  const valores = await preparar(db, datos, id);
  await db.runAsync(
    `UPDATE transacciones SET
      tipo = ?, monto = ?, fecha = ?, categoria_id = ?, billetera_origen_id = ?,
      billetera_destino_id = ?, monto_destino = ?, tasa_cambio = ?, nota = ?
     WHERE id = ?`,
    [...valores, id],
  );
}

export async function eliminarMovimiento(db: BaseDatos, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM transacciones WHERE id = ?`, [id]);
}

export async function obtenerMovimiento(db: BaseDatos, id: number): Promise<Movimiento | null> {
  return db.getFirstAsync<Movimiento>(`${SELECT_MOVIMIENTO} WHERE t.id = ?`, [id]);
}

export async function listarMovimientos(db: BaseDatos, f: FiltroMovimientos = {}): Promise<Movimiento[]> {
  const condiciones: string[] = [];
  const params: ValorSQL[] = [];
  if (f.billeteraId !== undefined) {
    condiciones.push('(t.billetera_origen_id = ? OR t.billetera_destino_id = ?)');
    params.push(f.billeteraId, f.billeteraId);
  }
  if (f.categoriaId !== undefined) {
    condiciones.push('t.categoria_id = ?');
    params.push(f.categoriaId);
  }
  if (f.tipo !== undefined) {
    condiciones.push('t.tipo = ?');
    params.push(f.tipo);
  }
  if (f.desde !== undefined) {
    condiciones.push('t.fecha >= ?');
    params.push(f.desde);
  }
  if (f.hasta !== undefined) {
    condiciones.push('t.fecha < ?');
    params.push(f.hasta);
  }
  params.push(f.limite ?? 50, f.desplazamiento ?? 0);
  return db.getAllAsync<Movimiento>(
    `${SELECT_MOVIMIENTO}
     ${condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : ''}
     ORDER BY t.fecha DESC, t.id DESC
     LIMIT ? OFFSET ?`,
    params,
  );
}

/**
 * Efecto del movimiento sobre una billetera concreta, en céntimos de esa
 * billetera: positivo si entra dinero, negativo si sale.
 */
export function efectoEnBilletera(m: Movimiento, billeteraId: number): number {
  if (m.tipo === 'TRANSFERENCIA' && m.billetera_destino_id === billeteraId) return m.monto_destino ?? 0;
  if (m.billetera_origen_id !== billeteraId) return 0;
  return m.tipo === 'INGRESO' || m.tipo === 'RETIRO_META' ? m.monto : -m.monto;
}
