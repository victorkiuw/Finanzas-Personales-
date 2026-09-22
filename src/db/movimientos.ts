import type { Moneda } from '../lib/moneda';
import { calcularTasa } from '../lib/tasa';
import { ErrorValidacion } from './billeteras';
import { categoriaComisiones } from './categorias';
import { enTransaccion, type BaseDatos, type ValorSQL } from './tipos';

/** Tipos que se registran desde el formulario de movimientos (las metas llegan en la fase 4). */
export type TipoMovimiento = 'GASTO' | 'INGRESO' | 'TRANSFERENCIA';

export type TipoTransaccion =
  | TipoMovimiento
  | 'APORTE_META'
  | 'RETIRO_META'
  | 'PRESTAMO_DADO'
  | 'PRESTAMO_RECIBIDO'
  | 'COBRO_DEUDA'
  | 'PAGO_DEUDA';

/** Tipos en los que entra dinero a billetera_origen_id (el resto resta, salvo el destino de una transferencia). */
export const TIPOS_ENTRADA: readonly TipoTransaccion[] = ['INGRESO', 'RETIRO_META', 'PRESTAMO_RECIBIDO', 'COBRO_DEUDA'];

export const TIPOS_DEUDA: readonly TipoTransaccion[] = ['PRESTAMO_DADO', 'PRESTAMO_RECIBIDO', 'COBRO_DEUDA', 'PAGO_DEUDA'];

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
  /**
   * Comisión bancaria en céntimos de la billetera origen (solo gastos y transferencias).
   * Se guarda como un gasto aparte en "Comisiones" vinculado a este movimiento.
   * Al editar: undefined la deja como está, 0/null la quita.
   */
  comision?: number | null;
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
  meta_nombre: string | null;
  meta_moneda: Moneda | null;
  /** Si este movimiento es la comisión de otro, el id de ese otro. */
  comision_de: number | null;
  /** Comisión vinculada a este movimiento, en céntimos de la billetera origen. */
  comision: number | null;
  deuda_id: number | null;
  deuda_persona: string | null;
}

export interface FiltroMovimientos {
  /** Movimientos donde la billetera es origen o destino. */
  billeteraId?: number;
  categoriaId?: number;
  metaId?: number;
  deudaId?: number;
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
    t.monto_destino, t.tasa_cambio, t.meta_id, m.nombre AS meta_nombre, m.moneda AS meta_moneda,
    t.comision_de, (SELECT SUM(c.monto) FROM transacciones c WHERE c.comision_de = t.id) AS comision,
    t.deuda_id, dd.persona AS deuda_persona
  FROM transacciones t
  JOIN billeteras o ON o.id = t.billetera_origen_id
  LEFT JOIN billeteras d ON d.id = t.billetera_destino_id
  LEFT JOIN categorias c ON c.id = t.categoria_id
  LEFT JOIN metas_ahorro m ON m.id = t.meta_id
  LEFT JOIN deudas dd ON dd.id = t.deuda_id`;

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

const NOTA_COMISION = 'Comisión bancaria';

function validarComision(d: DatosMovimiento): number | null | undefined {
  if (d.comision === undefined) return undefined;
  if (!d.comision) return null;
  if (d.tipo === 'INGRESO') throw new ErrorValidacion('Los ingresos no llevan comisión.');
  if (!montoValido(d.comision)) throw new ErrorValidacion('La comisión no es válida.');
  return d.comision;
}

/** Crea, actualiza o quita el gasto de comisión vinculado a un movimiento. */
async function sincronizarComision(db: BaseDatos, padreId: number, d: DatosMovimiento, comision: number | null) {
  const existente = await db.getFirstAsync<{ id: number }>(`SELECT id FROM transacciones WHERE comision_de = ?`, [padreId]);
  if (!comision) {
    if (existente) await db.runAsync(`DELETE FROM transacciones WHERE id = ?`, [existente.id]);
    return;
  }
  if (existente) {
    await db.runAsync(`UPDATE transacciones SET monto = ?, fecha = ?, billetera_origen_id = ? WHERE id = ?`, [
      comision,
      d.fecha,
      d.billetera_origen_id,
      existente.id,
    ]);
    return;
  }
  await db.runAsync(
    `INSERT INTO transacciones (tipo, monto, fecha, categoria_id, billetera_origen_id, nota, comision_de)
     VALUES ('GASTO', ?, ?, ?, ?, ?, ?)`,
    [comision, d.fecha, await categoriaComisiones(db), d.billetera_origen_id, NOTA_COMISION, padreId],
  );
}

export async function crearMovimiento(db: BaseDatos, datos: DatosMovimiento): Promise<number> {
  const valores = await preparar(db, datos);
  const comision = validarComision(datos);
  return enTransaccion(db, async () => {
    const r = await db.runAsync(
      `INSERT INTO transacciones
        (tipo, monto, fecha, categoria_id, billetera_origen_id, billetera_destino_id, monto_destino, tasa_cambio, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      valores,
    );
    if (comision) await sincronizarComision(db, r.lastInsertRowId, datos, comision);
    return r.lastInsertRowId;
  });
}

export async function actualizarMovimiento(db: BaseDatos, id: number, datos: DatosMovimiento): Promise<void> {
  const actual = await obtenerMovimiento(db, id);
  if (!actual) throw new ErrorValidacion('El movimiento no existe.');
  if (actual.meta_id !== null || actual.deuda_id !== null) {
    throw new ErrorValidacion('Los movimientos de metas y deudas se gestionan desde su propia pantalla.');
  }
  const valores = await preparar(db, datos, id);
  let comision = validarComision(datos);
  // Un ingreso no lleva comisión: si el movimiento pasa a ser ingreso, se quita la que tuviera.
  if (datos.tipo === 'INGRESO') comision = null;
  await enTransaccion(db, async () => {
    await db.runAsync(
      `UPDATE transacciones SET
        tipo = ?, monto = ?, fecha = ?, categoria_id = ?, billetera_origen_id = ?,
        billetera_destino_id = ?, monto_destino = ?, tasa_cambio = ?, nota = ?
       WHERE id = ?`,
      [...valores, id],
    );
    // Si no se indica la comisión, la vinculada sigue igual pero acompaña la billetera y fecha del movimiento.
    await sincronizarComision(db, id, datos, comision === undefined ? actual.comision : comision);
  });
}

export async function eliminarMovimiento(db: BaseDatos, id: number): Promise<void> {
  const m = await obtenerMovimiento(db, id);
  if (m?.tipo === 'APORTE_META') {
    // Quitar un aporte no puede dejar la meta con saldo negativo (ya se retiró ese dinero).
    const fila = await db.getFirstAsync<{ saldo: number }>(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'APORTE_META' THEN monto_destino ELSE -monto_destino END), 0) AS saldo
       FROM transacciones WHERE meta_id = ?`,
      [m.meta_id],
    );
    if ((fila?.saldo ?? 0) - (m.monto_destino ?? 0) < 0) {
      throw new ErrorValidacion('No se puede eliminar: ese dinero ya se retiró de la meta. Elimina antes el retiro.');
    }
  }
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
  if (f.metaId !== undefined) {
    condiciones.push('t.meta_id = ?');
    params.push(f.metaId);
  }
  if (f.deudaId !== undefined) {
    condiciones.push('t.deuda_id = ?');
    params.push(f.deudaId);
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
  return TIPOS_ENTRADA.includes(m.tipo) ? m.monto : -m.monto;
}

/**
 * Tasa de la última transferencia entre esas dos monedas (en cualquier sentido
 * si interviene el bolívar, porque la tasa se expresa igual: Bs. por dólar).
 */
export async function ultimaTasa(db: BaseDatos, de: Moneda, a: Moneda): Promise<number | null> {
  const ambosSentidos = de === 'BS' || a === 'BS' ? 1 : 0;
  const f = await db.getFirstAsync<{ tasa_cambio: number }>(
    `SELECT t.tasa_cambio FROM transacciones t
     JOIN billeteras o ON o.id = t.billetera_origen_id
     JOIN billeteras d ON d.id = t.billetera_destino_id
     WHERE t.tipo = 'TRANSFERENCIA' AND t.tasa_cambio IS NOT NULL
       AND ((o.moneda = ? AND d.moneda = ?) OR (? = 1 AND o.moneda = ? AND d.moneda = ?))
     ORDER BY t.fecha DESC, t.id DESC LIMIT 1`,
    [de, a, ambosSentidos, a, de],
  );
  return f?.tasa_cambio ?? null;
}
