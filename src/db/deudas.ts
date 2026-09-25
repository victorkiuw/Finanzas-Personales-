import { convertir, type Cambio } from '../lib/conversion';
import { equivalentes, esMoneda, INFO_MONEDA, type Moneda } from '../lib/moneda';
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
 *
 * Dinero de otros: una deuda "ajena" (tipo DEBO) es dinero de otra persona que
 * guardo en una de mis billeteras (p. ej. lo de mi abuela en Binance). Su
 * pendiente se resta de lo disponible. Si tomo prestado de ahí, lo guardado
 * baja y nace una deuda normal con ella, sin mover saldos; al devolverlo, lo
 * guardado sube de nuevo (con una transferencia si sale de otra billetera).
 * Esos cambios sin movimiento se guardan en `ajustes_deuda` y cuentan como
 * pagado (en la unidad de la deuda; negativos si aumentan lo pendiente).
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
  /** Dinero de otra persona guardado en `billetera_id` (no es mío). */
  ajeno: boolean;
  /** Billetera donde guardo el dinero ajeno. */
  billetera_id: number | null;
  billetera_nombre: string | null;
  /** Si la deuda nació de tomar prestado de un dinero ajeno, cuál. */
  origen_ajeno_id: number | null;
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
  /** Es dinero de otra persona que guardo en `billetera_id`. */
  ajeno?: boolean;
  /** Solo si es ajeno: el dinero ya estaba en el saldo (por defecto) o entra ahora. */
  ya_en_saldo?: boolean;
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
  ajeno: number;
  billetera_id: number | null;
  billetera_nombre: string | null;
  origen_ajeno_id: number | null;
}

const SELECT_DEUDA = `
  SELECT d.id, d.tipo, d.persona, d.moneda, d.monto, d.tasa_referencia, d.fecha, d.fecha_limite, d.nota, d.cerrada,
    d.ajeno, d.billetera_id, b.nombre AS billetera_nombre, d.origen_ajeno_id,
    COALESCE((SELECT SUM(t.monto_destino) FROM transacciones t
              WHERE t.deuda_id = d.id AND t.tipo IN ('COBRO_DEUDA', 'PAGO_DEUDA')), 0)
    + COALESCE((SELECT SUM(a.monto) FROM ajustes_deuda a WHERE a.deuda_id = d.id), 0) AS pagado
  FROM deudas d LEFT JOIN billeteras b ON b.id = d.billetera_id`;

function aDeuda(f: FilaDeuda): Deuda {
  const unidad = unidadDeuda(f.moneda, f.tasa_referencia);
  const total = totalEnUnidad(f.monto, f.moneda, f.tasa_referencia);
  return {
    ...f,
    cerrada: f.cerrada === 1,
    ajeno: f.ajeno === 1,
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
  if (d.ajeno) {
    if (d.tipo !== 'DEBO') throw new ErrorValidacion('El dinero de otros se registra como algo que le debes.');
    if (!d.billetera_id) throw new ErrorValidacion('Elige en qué billetera guardas ese dinero.');
  }
  if (!esMoneda(d.moneda)) throw new ErrorValidacion('Moneda inválida.');
  if (!Number.isSafeInteger(d.monto) || d.monto <= 0) throw new ErrorValidacion('El monto debe ser mayor que cero.');
  const tasa = d.moneda === 'BS' && !d.ajeno ? (d.tasa_referencia ?? null) : null;
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
  // El dinero ajeno que ya estaba en la billetera no se mueve: solo deja de ser mío.
  if (d.ajeno && d.ya_en_saldo !== false) return;
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
      `INSERT INTO deudas (tipo, persona, moneda, monto, tasa_referencia, fecha, fecha_limite, nota, ajeno, billetera_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.tipo, persona, d.moneda, d.monto, tasa, d.fecha, d.fecha_limite ?? null, d.nota?.trim() || null,
        d.ajeno ? 1 : 0, d.ajeno ? d.billetera_id! : null,
      ],
    );
    await insertarPrestamo(db, r.lastInsertRowId, d, total, tasa);
    return r.lastInsertRowId;
  });
}

/** Billetera de la que salió (o a la que entró) el préstamo, si se registró con una. */
export async function billeteraDeDeuda(db: BaseDatos, id: number): Promise<number | null> {
  const propia = await db.getFirstAsync<{ billetera_id: number | null }>(`SELECT billetera_id FROM deudas WHERE id = ?`, [id]);
  if (propia?.billetera_id) return propia.billetera_id;
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
export async function actualizarDeuda(db: BaseDatos, id: number, datos: DatosDeuda): Promise<void> {
  const actual = await obtenerDeuda(db, id);
  if (!actual) throw new ErrorValidacion('La deuda no existe.');
  let d = datos;
  if (actual.origen_ajeno_id) {
    // Se tomó de un dinero ajeno que ya estaba en mi billetera: no mueve saldos.
    if (d.moneda !== actual.moneda) throw new ErrorValidacion('No se puede cambiar la moneda de algo que tomaste prestado de lo que guardas.');
    d = { ...d, tipo: 'DEBO', billetera_id: null, ajeno: false };
  }
  if (d.ajeno && d.ya_en_saldo === undefined) {
    const mov = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transacciones WHERE deuda_id = ? AND tipo IN ('PRESTAMO_DADO', 'PRESTAMO_RECIBIDO')`,
      [id],
    );
    d = { ...d, ya_en_saldo: (mov?.n ?? 0) === 0 };
  }
  const { persona, tasa, total } = await validarDeuda(db, d, await billeteraDeDeuda(db, id));

  const pagos = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM transacciones WHERE deuda_id = ? AND tipo IN ('COBRO_DEUDA', 'PAGO_DEUDA'))
          + (SELECT COUNT(*) FROM ajustes_deuda WHERE deuda_id = ?) AS n`,
    [id, id],
  );
  const tienePagos = (pagos?.n ?? 0) > 0;
  if (tienePagos) {
    if (d.tipo !== actual.tipo) {
      throw new ErrorValidacion('Ya tiene pagos: para cambiar si prestaste o te prestaron, borra antes los pagos.');
    }
    if (!equivalentes(unidadDeuda(d.moneda, tasa), actual.unidad)) {
      throw new ErrorValidacion(
        `Ya tiene pagos contados en ${INFO_MONEDA[actual.unidad].nombre.toLowerCase()}: para cambiarlo, borra antes los pagos.`,
      );
    }
    if (actual.pagado > Math.ceil(total * (1 + TOLERANCIA))) {
      throw new ErrorValidacion('Lo ya pagado supera el nuevo monto.');
    }
  }

  // Se cierra sola si con el nuevo monto queda saldada, y se reabre si se había cerrado por pagos y ahora falta.
  let cerrada = actual.cerrada;
  if (tienePagos && actual.pagado >= total) cerrada = true;
  else if (tienePagos && actual.cerrada && actual.pagado < total) cerrada = false;
  else if (actual.cerrada && actual.pendiente === 0 && actual.pagado > 0) cerrada = false;

  await enTransaccion(db, async () => {
    await db.runAsync(
      `UPDATE deudas SET tipo = ?, persona = ?, moneda = ?, monto = ?, tasa_referencia = ?, fecha = ?,
         fecha_limite = ?, nota = ?, cerrada = ?, ajeno = ?, billetera_id = ?
       WHERE id = ?`,
      [
        d.tipo, persona, d.moneda, d.monto, tasa, d.fecha, d.fecha_limite ?? null, d.nota?.trim() || null, cerrada ? 1 : 0,
        d.ajeno ? 1 : 0, d.ajeno ? d.billetera_id! : null, id,
      ],
    );
    // Lo tomado de un dinero ajeno sigue al monto de la deuda.
    await db.runAsync(`UPDATE ajustes_deuda SET monto = ? WHERE grupo = ?`, [d.monto, grupoPrestamo(id)]);
    await db.runAsync(`DELETE FROM transacciones WHERE deuda_id = ? AND tipo IN ('PRESTAMO_DADO', 'PRESTAMO_RECIBIDO')`, [id]);
    await insertarPrestamo(db, id, d, total, tasa);
  });
}

export async function establecerDeudaCerrada(db: BaseDatos, id: number, cerrada: boolean): Promise<void> {
  await db.runAsync(`UPDATE deudas SET cerrada = ? WHERE id = ?`, [cerrada ? 1 : 0, id]);
}

/** Borra la deuda y todos sus movimientos (los saldos de las billeteras se recalculan). */
export async function eliminarDeuda(db: BaseDatos, id: number): Promise<void> {
  await enTransaccion(db, async () => {
    // Sus ajustes van en pareja con los del dinero ajeno: se deshacen ambos lados.
    await db.runAsync(
      `DELETE FROM ajustes_deuda WHERE grupo = ? OR grupo IN (SELECT grupo FROM ajustes_deuda WHERE deuda_id = ?)`,
      [grupoPrestamo(id), id],
    );
    await db.runAsync(`DELETE FROM deudas WHERE id = ?`, [id]);
  });
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
  const mismaUnidad = equivalentes(billetera.moneda, deuda.unidad);
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

/** Totales pendientes en dólares (convertidos con las tasas indicadas) para el resumen. */
export function resumenDeudas(deudas: Deuda[], cambio: Cambio): { meDeben: number; debo: number; completo: boolean } {
  let meDeben = 0;
  let debo = 0;
  let completo = true;
  for (const d of deudas) {
    if (d.cerrada || d.pendiente === 0 || d.ajeno) continue;
    const usd = convertir(d.pendiente, d.unidad, 'USD', cambio);
    if (usd === null) {
      completo = false;
      continue;
    }
    if (d.tipo === 'ME_DEBEN') meDeben += usd;
    else debo += usd;
  }
  return { meDeben, debo, completo };
}

/** Dinero de otros por billetera (en su moneda), para restarlo de lo disponible. */
export function ajenoPorBilletera(deudas: Deuda[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const d of deudas) {
    if (!d.ajeno || d.cerrada || d.pendiente === 0 || !d.billetera_id) continue;
    m.set(d.billetera_id, (m.get(d.billetera_id) ?? 0) + d.pendiente);
  }
  return m;
}

/** Grupo del ajuste que resta del dinero ajeno lo que se tomó prestado. */
const grupoPrestamo = (deudaId: number) => `prestamo-${deudaId}`;

const nuevoGrupo = () => `devolucion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function obtenerAjeno(db: BaseDatos, id: number): Promise<Deuda> {
  const a = await obtenerDeuda(db, id);
  if (!a || !a.ajeno) throw new ErrorValidacion('Ese dinero guardado ya no existe.');
  return a;
}

export interface DatosTomarPrestado {
  ajeno_id: number;
  /** Céntimos en la moneda del dinero guardado. */
  monto: number;
  /** Solo si es en bolívares: llevar la deuda en dólares a esta tasa. */
  tasa_referencia?: number | null;
  fecha: string;
  nota?: string | null;
}

/**
 * Tomo prestado del dinero ajeno: lo guardado baja y queda una deuda con esa
 * persona. No hay movimiento, porque el dinero ya estaba en mi billetera.
 */
export async function tomarPrestadoDeAjeno(db: BaseDatos, p: DatosTomarPrestado): Promise<number> {
  const ajeno = await obtenerAjeno(db, p.ajeno_id);
  if (!Number.isSafeInteger(p.monto) || p.monto <= 0) throw new ErrorValidacion('El monto debe ser mayor que cero.');
  if (p.monto > ajeno.pendiente) throw new ErrorValidacion('Es más de lo que le guardas.');
  const datos: DatosDeuda = {
    tipo: 'DEBO',
    persona: ajeno.persona,
    moneda: ajeno.moneda,
    monto: p.monto,
    tasa_referencia: p.tasa_referencia ?? null,
    fecha: p.fecha,
    nota: p.nota ?? `Lo tomé de lo que le guardo${ajeno.billetera_nombre ? ` en ${ajeno.billetera_nombre}` : ''}`,
  };
  const { persona, tasa } = await validarDeuda(db, datos);
  return enTransaccion(db, async () => {
    const r = await db.runAsync(
      `INSERT INTO deudas (tipo, persona, moneda, monto, tasa_referencia, fecha, nota, origen_ajeno_id)
       VALUES ('DEBO', ?, ?, ?, ?, ?, ?, ?)`,
      [persona, datos.moneda, datos.monto, tasa, datos.fecha, datos.nota?.trim() || null, ajeno.id],
    );
    const id = r.lastInsertRowId;
    await db.runAsync(`INSERT INTO ajustes_deuda (deuda_id, monto, fecha, grupo, nota) VALUES (?, ?, ?, ?, ?)`, [
      ajeno.id, p.monto, p.fecha, grupoPrestamo(id), 'Tomado prestado',
    ]);
    return id;
  });
}

export interface DatosDevolverAjeno {
  /** Deuda que nació de tomar prestado. */
  deuda_id: number;
  /** Lo que vuelve a lo guardado, en su moneda. */
  monto: number;
  /** Cuánto descuenta de la deuda en su unidad (solo si no es la misma moneda). */
  monto_unidad?: number | null;
  /** Billetera de la que sale el dinero; si no es la del dinero guardado, se registra la transferencia. */
  desde_billetera_id?: number | null;
  /** Lo que salió de esa billetera, en su moneda (solo si es otra moneda). */
  monto_origen?: number | null;
  fecha: string;
}

/**
 * Devuelvo lo que tomé prestado a lo que le guardo: lo guardado sube, la deuda
 * baja y, si el dinero sale de otra billetera, se registra la transferencia
 * (p. ej. Mercantil → Binance a la tasa del P2P).
 */
export async function devolverAAjeno(db: BaseDatos, p: DatosDevolverAjeno): Promise<void> {
  const deuda = await obtenerDeuda(db, p.deuda_id);
  if (!deuda) throw new ErrorValidacion('La deuda no existe.');
  if (!deuda.origen_ajeno_id) throw new ErrorValidacion('Esta deuda no salió de un dinero que guardas.');
  if (deuda.cerrada) throw new ErrorValidacion('La deuda está cerrada. Reábrela para registrar pagos.');
  const ajeno = await obtenerAjeno(db, deuda.origen_ajeno_id);
  if (!ajeno.billetera_id) throw new ErrorValidacion('La billetera donde guardas ese dinero ya no existe.');
  if (!Number.isSafeInteger(p.monto) || p.monto <= 0) throw new ErrorValidacion('El monto debe ser mayor que cero.');
  if (Number.isNaN(Date.parse(p.fecha))) throw new ErrorValidacion('La fecha no es válida.');

  let enUnidad = equivalentes(ajeno.moneda, deuda.unidad) ? p.monto : p.monto_unidad;
  if (!enUnidad || !Number.isSafeInteger(enUnidad) || enUnidad <= 0) {
    throw new ErrorValidacion('Indica la tasa o cuánto descuenta de la deuda.');
  }
  if (enUnidad > deuda.pendiente) {
    if (enUnidad > Math.ceil(deuda.pendiente * (1 + TOLERANCIA))) throw new ErrorValidacion('Es más de lo que debes.');
    enUnidad = deuda.pendiente;
  }

  let transferencia: { origen: number; monto: number; tasa: number | null } | null = null;
  if (p.desde_billetera_id && p.desde_billetera_id !== ajeno.billetera_id) {
    const origen = await db.getFirstAsync<{ moneda: Moneda; archivada: number }>(
      `SELECT moneda, archivada FROM billeteras WHERE id = ?`,
      [p.desde_billetera_id],
    );
    if (!origen || origen.archivada) throw new ErrorValidacion('Elige una billetera activa de donde sale el dinero.');
    const monto = origen.moneda === ajeno.moneda ? p.monto : p.monto_origen;
    if (!monto || !Number.isSafeInteger(monto) || monto <= 0) throw new ErrorValidacion('Indica cuánto salió o la tasa.');
    const tasa = origen.moneda === ajeno.moneda ? null : calcularTasa(origen.moneda, ajeno.moneda, monto, p.monto);
    transferencia = { origen: p.desde_billetera_id, monto, tasa };
  }

  const grupo = nuevoGrupo();
  await enTransaccion(db, async () => {
    if (transferencia) {
      await db.runAsync(
        `INSERT INTO transacciones
          (tipo, monto, fecha, billetera_origen_id, billetera_destino_id, monto_destino, tasa_cambio, nota, deuda_id)
         VALUES ('TRANSFERENCIA', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transferencia.monto, p.fecha, transferencia.origen, ajeno.billetera_id, p.monto, transferencia.tasa,
          `Devolución a ${deuda.persona}`, deuda.id,
        ],
      );
    }
    const ajuste = `INSERT INTO ajustes_deuda (deuda_id, monto, fecha, grupo, nota) VALUES (?, ?, ?, ?, ?)`;
    await db.runAsync(ajuste, [deuda.id, enUnidad!, p.fecha, grupo, 'Devuelto a lo que le guardo']);
    await db.runAsync(ajuste, [ajeno.id, -p.monto, p.fecha, grupo, 'Me devolví lo que tomé']);
    if (deuda.pendiente - enUnidad! <= 0) await establecerDeudaCerrada(db, deuda.id, true);
    if (ajeno.cerrada) await establecerDeudaCerrada(db, ajeno.id, false);
  });
}

export interface AjusteDeuda {
  id: number;
  monto: number;
  fecha: string;
  nota: string | null;
}

/** Cambios sin movimiento (tomado prestado, devuelto) de una deuda, del más nuevo al más viejo. */
export async function listarAjustes(db: BaseDatos, deudaId: number): Promise<AjusteDeuda[]> {
  return db.getAllAsync<AjusteDeuda>(
    `SELECT id, monto, fecha, nota FROM ajustes_deuda WHERE deuda_id = ? ORDER BY fecha DESC, id DESC`,
    [deudaId],
  );
}
