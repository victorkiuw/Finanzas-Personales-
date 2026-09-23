import { esMoneda, type Moneda } from '../lib/moneda';
import { calcularTasa } from '../lib/tasa';
import { ErrorValidacion } from './billeteras';
import { enTransaccion, type BaseDatos } from './tipos';

/*
 * Deudas y préstamos.
 *
 * Una deuda en bolívares puede "indexarse al dólar": se guarda la tasa a la que
 * se valoró el préstamo (tasa_referencia, Bs. por USD) y a partir de ahí la
 * deuda se lleva en dólares. Así, si presté Bs. 9.524 a 952,4 (= $10), al
 * cobrar me deben $10, que hoy pueden ser Bs. 11.000.
 *
 * La "unidad" de la deuda es USD si está indexada, o su moneda si no. Cada pago
 * guarda en `monto` lo que se movió en la billetera y en `monto_destino` cuánto
 * descuenta de la deuda, en su unidad.
 */

export type TipoDeuda = 'ME_DEBEN' | 'DEBO';

export interface Deuda {
  id: number;
  tipo: TipoDeuda;
  persona: string;
  moneda: Moneda;
  /** Céntimos en `moneda` del préstamo original. */
  monto: number;
  /** Bs. por USD con que se valoró el préstamo; si existe, la deuda va en dólares. */
  tasa_referencia: number | null;
  fecha: string;
  fecha_limite: string | null;
  nota: string | null;
  cerrada: boolean;
  /** Moneda en la que se lleva la cuenta: USD si está indexada, si no `moneda`. */
  unidad: Moneda;
  /** Monto original expresado en la unidad. */
  total: number;
  /** Lo ya pagado, en la unidad. */
  pagado: number;
  /** Lo que falta, en la unidad (nunca negativo). */
  pendiente: number;
}

export interface DatosDeuda {
  tipo: TipoDeuda;
  persona: string;
  moneda: Moneda;
  monto: number;
  tasa_referencia?: number | null;
  fecha: string;
  fecha_limite?: string | null;
  nota?: string | null;
  /** Si se indica, el dinero sale (ME_DEBEN) o entra (DEBO) en esta billetera, que debe ser de la misma moneda. */
  billetera_id?: number | null;
}

export const LARGO_MAXIMO_PERSONA = 40;

/** Tolerancia al pagar de más por redondeo de la tasa (1 %). */
const TOLERANCIA = 0.01;

export function unidadDeuda(moneda: Moneda, tasaReferencia: number | null): Moneda {
  return tasaReferencia ? 'USD' : moneda;
}

/** Monto original en la unidad de la deuda (dólares si está indexada). */
export function totalEnUnidad(monto: number, moneda: Moneda, tasaReferencia: number | null): number {
  if (!tasaReferencia) return monto;
  return moneda === 'BS' ? Math.round(monto / tasaReferencia) : monto;
}

interface FilaDeuda {
  id: number;
  tipo: TipoDeuda;
  persona: string;
  moneda: Moneda;
  monto: number;
  tasa_referencia: number | null;
  fecha: string;
  fecha_limite: string | null;
  nota: string | null;
  cerrada: number;
  pagado: number;
}

const SELECT_DEUDA = `
  SELECT d.id, d.tipo, d.persona, d.moneda, d.monto, d.tasa_referencia, d.fecha, d.fecha_limite, d.nota, d.cerrada,
    COALESCE((SELECT SUM(t.monto_destino) FROM transacciones t
              WHERE t.deuda_id = d.id AND t.tipo IN ('COBRO_DEUDA', 'PAGO_DEUDA')), 0) AS pagado
  FROM deudas d`;

function aDeuda(f: FilaDeuda): Deuda {
  const unidad = unidadDeuda(f.moneda, f.tasa_referencia);
  const total = totalEnUnidad(f.monto, f.moneda, f.tasa_referencia);
  return {
    ...f,
    cerrada: f.cerrada === 1,
    unidad,
    total,
    pagado: f.pagado,
    pendiente: Math.max(total - f.pagado, 0),
  };
}

export async function listarDeudas(
  db: BaseDatos,
  { incluirCerradas = true }: { incluirCerradas?: boolean } = {},
): Promise<Deuda[]> {
  const filas = await db.getAllAsync<FilaDeuda>(
    `${SELECT_DEUDA} ${incluirCerradas ? '' : 'WHERE d.cerrada = 0'} ORDER BY d.cerrada, d.fecha DESC, d.id DESC`,
    [],
  );
  return filas.map(aDeuda);
}

export async function obtenerDeuda(db: BaseDatos, id: number): Promise<Deuda | null> {
  const f = await db.getFirstAsync<FilaDeuda>(`${SELECT_DEUDA} WHERE d.id = ?`, [id]);
  return f ? aDeuda(f) : null;
}

function validarTexto(persona: string, fecha: string, fechaLimite: string | null | undefined) {
  const p = persona.trim();
  if (!p) throw new ErrorValidacion('Escribe el nombre de la persona.');
  if (p.length > LARGO_MAXIMO_PERSONA) throw new ErrorValidacion(`El nombre no puede superar ${LARGO_MAXIMO_PERSONA} caracteres.`);
  if (Number.isNaN(Date.parse(fecha))) throw new ErrorValidacion('La fecha no es válida.');
  if (fechaLimite && !/^\d{4}-\d{2}-\d{2}$/.test(fechaLimite)) throw new ErrorValidacion('La fecha límite no es válida.');
  return p;
}

async function validarDeuda(
  db: BaseDatos,
  d: DatosDeuda,
  billeteraPermitida: number | null = null,
): Promise<{ persona: string; tasa: number | null; total: number }> {
  const persona = validarTexto(d.persona, d.fecha, d.fecha_limite);
  if (d.tipo !== 'ME_DEBEN' && d.tipo !== 'DEBO') throw new ErrorValidacion('Tipo inválido.');
  if (!esMoneda(d.moneda)) throw new ErrorValidacion('Moneda inválida.');
  if (!Number.isSafeInteger(d.monto) || d.monto <= 0) throw new ErrorValidacion('El monto debe ser mayor que cero.');
  const tasa = d.moneda === 'BS' ? (d.tasa_referencia ?? null) : null;
  if (tasa !== null && !(tasa > 0)) throw new ErrorValidacion('La tasa no es válida.');
  const total = totalEnUnidad(d.monto, d.moneda, tasa);
  if (total <= 0) throw new ErrorValidacion('El monto es demasiado pequeño para esa tasa.');

  if (d.billetera_id) {
    const billetera = await db.getFirstAsync<{ moneda: Moneda; archivada: number }>(
      `SELECT moneda, archivada FROM billeteras WHERE id = ?`,
      [d.billetera_id],
    );
    if (!billetera) throw new ErrorValidacion('La billetera no existe.');
    // Al editar se acepta la billetera que ya tenía aunque luego se archivara.
    if (billetera.archivada && d.billetera_id !== billeteraPermitida) throw new ErrorValidacion('La billetera está archivada.');
    if (billetera.moneda !== d.moneda) throw new ErrorValidacion('La billetera debe ser de la misma moneda que el préstamo.');
  }
  return { persona, tasa, total };
}

/** Movimiento del préstamo en la billetera (el dinero sale si presté, entra si me prestaron). */
async function insertarPrestamo(db: BaseDatos, id: number, d: DatosDeuda, total: number, tasa: number | null) {
  if (!d.billetera_id) return;
  await db.runAsync(
    `INSERT INTO transacciones (tipo, monto, fecha, billetera_origen_id, deuda_id, monto_destino, tasa_cambio)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [d.tipo === 'ME_DEBEN' ? 'PRESTAMO_DADO' : 'PRESTAMO_RECIBIDO', d.monto, d.fecha, d.billetera_id, id, total, tasa],
  );
}

export async function crearDeuda(db: BaseDatos, d: DatosDeuda): Promise<number> {
  const { persona, tasa, total } = await validarDeuda(db, d);
  return enTransaccion(db, async () => {
    const r = await db.runAsync(
      `INSERT INTO deudas (tipo, persona, moneda, monto, tasa_referencia, fecha, fecha_limite, nota) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.tipo, persona, d.moneda, d.monto, tasa, d.fecha, d.fecha_limite ?? null, d.nota?.trim() || null],
    );
    await insertarPrestamo(db, r.lastInsertRowId, d, total, tasa);
    return r.lastInsertRowId;
  });
}

/** Billetera de la que salió (o a la que entró) el préstamo, si se registró con una. */
export async function billeteraDeDeuda(db: BaseDatos, id: number): Promise<number | null> {
  const f = await db.getFirstAsync<{ billetera_origen_id: number }>(
    `SELECT billetera_origen_id FROM transacciones
     WHERE deuda_id = ? AND tipo IN ('PRESTAMO_DADO', 'PRESTAMO_RECIBIDO') ORDER BY id LIMIT 1`,
    [id],
  );
  return f?.billetera_origen_id ?? null;
}

/**
 * Edita todo de la deuda. El movimiento del préstamo se rehace con los datos
 * nuevos (o desaparece si se quita la billetera). Si ya hay pagos no se puede
 * cambiar el tipo ni pasar entre bolívares y dólares, porque los pagos están
 * contados en esa unidad; sí se pueden corregir el monto y la tasa.
 */
export async function actualizarDeuda(db: BaseDatos, id: number, d: DatosDeuda): Promise<void> {
  const actual = await obtenerDeuda(db, id);
  if (!actual) throw new ErrorValidacion('La deuda no existe.');
  const { persona, tasa, total } = await validarDeuda(db, d, await billeteraDeDeuda(db, id));

  const pagos = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transacciones WHERE deuda_id = ? AND tipo IN ('COBRO_DEUDA', 'PAGO_DEUDA')`,
    [id],
  );
  const tienePagos = (pagos?.n ?? 0) > 0;
  if (tienePagos) {
    if (d.tipo !== actual.tipo) {
      throw new ErrorValidacion('Ya tiene pagos: para cambiar si prestaste o te prestaron, borra antes los pagos.');
    }
    if ((unidadDeuda(d.moneda, tasa) === 'BS') !== (actual.unidad === 'BS')) {
      throw new ErrorValidacion(
        `Ya tiene pagos contados en ${actual.unidad === 'BS' ? 'bolívares' : 'dólares'}: para cambiarlo, borra antes los pagos.`,
      );
    }
    if (actual.pagado > Math.ceil(total * (1 + TOLERANCIA))) {
      throw new ErrorValidacion('Lo ya pagado supera el nuevo monto.');
    }
  }

  // Se cierra sola si con el nuevo monto queda saldada, y se reabre si se había cerrado por pagos y ahora falta.
  let cerrada = actual.cerrada;
  if (tienePagos && actual.pagado >= total) cerrada = true;
  else if (actual.cerrada && actual.pendiente === 0 && actual.pagado > 0) cerrada = false;

  await enTransaccion(db, async () => {
    await db.runAsync(
      `UPDATE deudas SET tipo = ?, persona = ?, moneda = ?, monto = ?, tasa_referencia = ?, fecha = ?,
         fecha_limite = ?, nota = ?, cerrada = ?
       WHERE id = ?`,
      [d.tipo, persona, d.moneda, d.monto, tasa, d.fecha, d.fecha_limite ?? null, d.nota?.trim() || null, cerrada ? 1 : 0, id],
    );
    await db.runAsync(`DELETE FROM transacciones WHERE deuda_id = ? AND tipo IN ('PRESTAMO_DADO', 'PRESTAMO_RECIBIDO')`, [id]);
    await insertarPrestamo(db, id, d, total, tasa);
  });
}

export async function establecerDeudaCerrada(db: BaseDatos, id: number, cerrada: boolean): Promise<void> {
  await db.runAsync(`UPDATE deudas SET cerrada = ? WHERE id = ?`, [cerrada ? 1 : 0, id]);
}

/** Borra la deuda y todos sus movimientos (los saldos de las billeteras se recalculan). */
export async function eliminarDeuda(db: BaseDatos, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM deudas WHERE id = ?`, [id]);
}

export interface DatosPagoDeuda {
  deuda_id: number;
  billetera_id: number;
  /** Céntimos en la moneda de la billetera. */
  monto: number;
  /** Cuánto descuenta de la deuda, en su unidad (se ignora si la billetera ya está en esa unidad). */
  monto_unidad?: number | null;
  fecha: string;
  nota?: string | null;
}

/**
 * Registra un pago: si me deben, el dinero entra a la billetera (cobro); si
 * debo, sale (pago). Cierra la deuda automáticamente al llegar a cero.
 */
export async function registrarPagoDeuda(db: BaseDatos, p: DatosPagoDeuda): Promise<number> {
  const deuda = await obtenerDeuda(db, p.deuda_id);
  if (!deuda) throw new ErrorValidacion('La deuda no existe.');
  if (deuda.cerrada) throw new ErrorValidacion('La deuda está cerrada. Reábrela para registrar pagos.');
  const billetera = await db.getFirstAsync<{ moneda: Moneda; archivada: number }>(
    `SELECT moneda, archivada FROM billeteras WHERE id = ?`,
    [p.billetera_id],
  );
  if (!billetera) throw new ErrorValidacion('Elige una billetera.');
  if (billetera.archivada) throw new ErrorValidacion('La billetera está archivada.');
  if (!Number.isSafeInteger(p.monto) || p.monto <= 0) throw new ErrorValidacion('El monto debe ser mayor que cero.');
  if (Number.isNaN(Date.parse(p.fecha))) throw new ErrorValidacion('La fecha no es válida.');

  // USD y USDT se consideran equivalentes.
  const mismaUnidad =
    billetera.moneda === deuda.unidad || (billetera.moneda !== 'BS' && deuda.unidad !== 'BS');
  let enUnidad = mismaUnidad ? p.monto : p.monto_unidad;
  if (!enUnidad || !Number.isSafeInteger(enUnidad) || enUnidad <= 0) {
    throw new ErrorValidacion('Indica la tasa o cuánto descuenta de la deuda.');
  }
  if (enUnidad > deuda.pendiente) {
    if (enUnidad > Math.ceil(deuda.pendiente * (1 + TOLERANCIA))) {
      throw new ErrorValidacion('El pago es mayor que lo pendiente.');
    }
    enUnidad = deuda.pendiente; // diferencia de redondeo: salda la deuda
  }
  const tasa = mismaUnidad ? null : calcularTasa(billetera.moneda, deuda.unidad, p.monto, enUnidad);

  return enTransaccion(db, async () => {
    const r = await db.runAsync(
      `INSERT INTO transacciones (tipo, monto, fecha, billetera_origen_id, deuda_id, monto_destino, tasa_cambio, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deuda.tipo === 'ME_DEBEN' ? 'COBRO_DEUDA' : 'PAGO_DEUDA',
        p.monto,
        p.fecha,
        p.billetera_id,
        p.deuda_id,
        enUnidad,
        tasa,
        p.nota?.trim() || null,
      ],
    );
    if (deuda.pendiente - enUnidad <= 0) await establecerDeudaCerrada(db, p.deuda_id, true);
    return r.lastInsertRowId;
  });
}

/** Totales pendientes (en USD, con la tasa indicada para lo que esté en Bs.) para el resumen. */
export function resumenDeudas(deudas: Deuda[], bsPorDolar: number | null): { meDeben: number; debo: number; completo: boolean } {
  let meDeben = 0;
  let debo = 0;
  let completo = true;
  for (const d of deudas) {
    if (d.cerrada || d.pendiente === 0) continue;
    let usd: number;
    if (d.unidad !== 'BS') usd = d.pendiente;
    else if (bsPorDolar) usd = Math.round(d.pendiente / bsPorDolar);
    else {
      completo = false;
      continue;
    }
    if (d.tipo === 'ME_DEBEN') meDeben += usd;
    else debo += usd;
  }
  return { meDeben, debo, completo };
}
