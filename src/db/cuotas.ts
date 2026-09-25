import { calcularTasa } from '../lib/tasa';
import { equivalentes, type Moneda } from '../lib/moneda';
import { ErrorValidacion } from './billeteras';
import { categoriaComisiones } from './categorias';
import { guardarPreferencia, leerPreferencia } from './preferencias';
import { enTransaccion, type BaseDatos } from './tipos';

/*
 * Compras a cuotas (Cashea). Todo se lleva en dólares: se paga una inicial al
 * comprar y el resto en cuotas iguales cada 14 días desde la fecha de compra.
 * Cada pago es un GASTO de la billetera con la que se paga (así cuenta en los
 * reportes el día que se paga) enlazado a la compra; en `monto_destino` va lo
 * que abona en dólares.
 */

export const DIAS_ENTRE_CUOTAS = 14;
const CLAVE_LIMITE = 'cashea_limite';
const CLAVE_ULTIMA_INICIAL = 'cashea_ultima_inicial_pct';

export interface Cuota {
  numero: number;
  /** "AAAA-MM-DD". */
  fecha: string;
  /** Céntimos de dólar. */
  monto: number;
  pagada: boolean;
}

export interface CompraCuotas {
  id: number;
  comercio: string;
  descripcion: string | null;
  /** Céntimos de dólar. */
  total: number;
  inicial: number;
  cuotas: number;
  dias_entre_cuotas: number;
  fecha: string;
  categoria_id: number | null;
  /** Lo abonado a las cuotas (sin la inicial). */
  abonado: number;
  /** Lo que falta por pagar. */
  pendiente: number;
  calendario: Cuota[];
  /** Próxima cuota sin pagar, si queda alguna. */
  proxima: Cuota | null;
}

export interface DatosCompra {
  comercio: string;
  descripcion?: string | null;
  total: number;
  inicial: number;
  cuotas: number;
  fecha: string;
  categoria_id: number;
  /** Billetera con la que se pagó la inicial (opcional: sin ella no se mueven saldos). */
  billetera_id?: number | null;
  /** Lo que salió de la billetera en su moneda (si no es en dólares). */
  monto_billetera?: number | null;
  /** Comisión bancaria del pago de la inicial, en la moneda de la billetera. */
  comision?: number | null;
}

const aClave = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Montos de cada cuota: iguales, y la última absorbe el redondeo. */
export function montosCuotas(financiado: number, cuotas: number): number[] {
  const base = Math.floor(financiado / cuotas);
  return Array.from({ length: cuotas }, (_, i) => (i === cuotas - 1 ? financiado - base * (cuotas - 1) : base));
}

/** Calendario: cuota i vence i × 14 días después de la compra; se marcan pagadas en orden según lo abonado. */
export function calendario(
  c: { total: number; inicial: number; cuotas: number; fecha: string; dias_entre_cuotas: number },
  abonado: number,
): Cuota[] {
  const inicio = new Date(c.fecha);
  let resto = abonado;
  return montosCuotas(c.total - c.inicial, c.cuotas).map((monto, i) => {
    const f = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + c.dias_entre_cuotas * (i + 1));
    const pagada = resto >= monto;
    resto -= monto;
    return { numero: i + 1, fecha: aClave(f), monto, pagada };
  });
}

interface Fila {
  id: number;
  comercio: string;
  descripcion: string | null;
  total: number;
  inicial: number;
  cuotas: number;
  dias_entre_cuotas: number;
  fecha: string;
  categoria_id: number | null;
  abonado: number;
}

const SELECT = `
  SELECT c.id, c.comercio, c.descripcion, c.total, c.inicial, c.cuotas, c.dias_entre_cuotas, c.fecha, c.categoria_id,
    COALESCE((SELECT SUM(t.monto_destino) FROM transacciones t
              WHERE t.compra_id = c.id AND t.id IS NOT c.inicial_transaccion_id), 0) AS abonado
  FROM compras_cuotas c`;

function aCompra(f: Fila): CompraCuotas {
  const cal = calendario(f, f.abonado);
  return {
    ...f,
    pendiente: Math.max(f.total - f.inicial - f.abonado, 0),
    calendario: cal,
    proxima: cal.find((q) => !q.pagada) ?? null,
  };
}

export async function listarCompras(db: BaseDatos): Promise<CompraCuotas[]> {
  const filas = await db.getAllAsync<Fila>(`${SELECT} ORDER BY c.fecha DESC, c.id DESC`, []);
  // Primero las que tienen cuotas por pagar, por la que vence antes.
  return filas.map(aCompra).sort((a, b) => {
    if (!a.proxima !== !b.proxima) return a.proxima ? -1 : 1;
    return (a.proxima?.fecha ?? '').localeCompare(b.proxima?.fecha ?? '');
  });
}

export async function obtenerCompra(db: BaseDatos, id: number): Promise<CompraCuotas | null> {
  const f = await db.getFirstAsync<Fila>(`${SELECT} WHERE c.id = ?`, [id]);
  return f ? aCompra(f) : null;
}

function validarComision(c: number | null | undefined): number {
  if (!c) return 0;
  if (!Number.isSafeInteger(c) || c < 0) throw new ErrorValidacion('La comisión no es válida.');
  return c;
}

/** Gasto de comisión bancaria enlazado al pago (se borra con él). */
async function insertarComision(db: BaseDatos, padre: number, billetera: number, comision: number, fecha: string) {
  await db.runAsync(
    `INSERT INTO transacciones (tipo, monto, fecha, categoria_id, billetera_origen_id, nota, comision_de)
     VALUES ('GASTO', ?, ?, ?, ?, 'Comisión bancaria', ?)`,
    [comision, fecha, await categoriaComisiones(db), billetera, padre],
  );
}

async function billeteraActiva(db: BaseDatos, id: number) {
  const b = await db.getFirstAsync<{ moneda: Moneda; archivada: number }>(`SELECT moneda, archivada FROM billeteras WHERE id = ?`, [id]);
  if (!b || b.archivada) throw new ErrorValidacion('Elige una billetera activa.');
  return b;
}

/** Monto en la billetera y tasa (Bs. por dólar) para pagar `usd` desde ella. */
function montoEnBilletera(moneda: Moneda, usd: number, montoBilletera: number | null | undefined) {
  if (equivalentes(moneda, 'USD')) return { monto: usd, tasa: null };
  if (!montoBilletera || !Number.isSafeInteger(montoBilletera) || montoBilletera <= 0) {
    throw new ErrorValidacion('Indica cuánto salió de la billetera o la tasa.');
  }
  return { monto: montoBilletera, tasa: calcularTasa(moneda, 'USD', montoBilletera, usd) };
}

export async function crearCompra(db: BaseDatos, d: DatosCompra): Promise<number> {
  const comercio = d.comercio.trim();
  if (!comercio) throw new ErrorValidacion('Escribe dónde compraste.');
  if (!Number.isSafeInteger(d.total) || d.total <= 0) throw new ErrorValidacion('El total debe ser mayor que cero.');
  if (!Number.isSafeInteger(d.inicial) || d.inicial < 0 || d.inicial >= d.total) {
    throw new ErrorValidacion('La inicial debe ser menor que el total.');
  }
  if (!Number.isInteger(d.cuotas) || d.cuotas < 1 || d.cuotas > 24) throw new ErrorValidacion('Elige entre 1 y 24 cuotas.');
  if (Number.isNaN(Date.parse(d.fecha))) throw new ErrorValidacion('La fecha no es válida.');
  const pago = d.billetera_id && d.inicial > 0
    ? montoEnBilletera((await billeteraActiva(db, d.billetera_id)).moneda, d.inicial, d.monto_billetera)
    : null;
  const comision = validarComision(d.comision);

  return enTransaccion(db, async () => {
    const r = await db.runAsync(
      `INSERT INTO compras_cuotas (comercio, descripcion, total, inicial, cuotas, dias_entre_cuotas, fecha, categoria_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [comercio, d.descripcion?.trim() || null, d.total, d.inicial, d.cuotas, DIAS_ENTRE_CUOTAS, d.fecha, d.categoria_id],
    );
    const id = r.lastInsertRowId;
    if (pago && d.billetera_id) {
      const t = await db.runAsync(
        `INSERT INTO transacciones (tipo, monto, fecha, categoria_id, billetera_origen_id, monto_destino, tasa_cambio, nota, compra_id)
         VALUES ('GASTO', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [pago.monto, d.fecha, d.categoria_id, d.billetera_id, d.inicial, pago.tasa, `Inicial ${comercio}`, id],
      );
      await db.runAsync(`UPDATE compras_cuotas SET inicial_transaccion_id = ? WHERE id = ?`, [t.lastInsertRowId, id]);
      if (comision) await insertarComision(db, t.lastInsertRowId, d.billetera_id, comision, d.fecha);
    }
    if (d.total > 0) await guardarPreferencia(db, CLAVE_ULTIMA_INICIAL, String(Math.round((d.inicial / d.total) * 100)));
    return id;
  });
}

/** Paga la próxima cuota (o el monto indicado en dólares) desde una billetera. */
export async function pagarCuota(
  db: BaseDatos,
  p: {
    compra_id: number;
    billetera_id: number;
    usd?: number;
    monto_billetera?: number | null;
    fecha: string;
    /** Comisión bancaria del pago, en la moneda de la billetera. */
    comision?: number | null;
  },
): Promise<number> {
  const c = await obtenerCompra(db, p.compra_id);
  if (!c) throw new ErrorValidacion('La compra no existe.');
  if (c.pendiente <= 0) throw new ErrorValidacion('Esta compra ya está pagada.');
  const usd = p.usd ?? Math.min(c.proxima?.monto ?? c.pendiente, c.pendiente);
  if (!Number.isSafeInteger(usd) || usd <= 0) throw new ErrorValidacion('El monto debe ser mayor que cero.');
  if (usd > c.pendiente) throw new ErrorValidacion('Es más de lo que falta por pagar.');
  const b = await billeteraActiva(db, p.billetera_id);
  const pago = montoEnBilletera(b.moneda, usd, p.monto_billetera);
  const comision = validarComision(p.comision);
  return enTransaccion(db, async () => {
    const r = await db.runAsync(
      `INSERT INTO transacciones (tipo, monto, fecha, categoria_id, billetera_origen_id, monto_destino, tasa_cambio, nota, compra_id)
       VALUES ('GASTO', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pago.monto, p.fecha, c.categoria_id, p.billetera_id, usd, pago.tasa, `Cuota ${c.comercio}`, c.id],
    );
    if (comision) await insertarComision(db, r.lastInsertRowId, p.billetera_id, comision, p.fecha);
    return r.lastInsertRowId;
  });
}

/** Borra la compra y todos sus pagos (los saldos se recalculan). */
export async function eliminarCompra(db: BaseDatos, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM compras_cuotas WHERE id = ?`, [id]);
}

export async function leerLimite(db: BaseDatos): Promise<number | null> {
  const v = await leerPreferencia(db, CLAVE_LIMITE);
  return v ? Number(v) : null;
}

export async function guardarLimite(db: BaseDatos, limite: number | null): Promise<void> {
  if (limite !== null && (!Number.isSafeInteger(limite) || limite <= 0)) throw new ErrorValidacion('El límite no es válido.');
  if (limite === null) await db.runAsync(`DELETE FROM preferencias WHERE clave = ?`, [CLAVE_LIMITE]);
  else await guardarPreferencia(db, CLAVE_LIMITE, String(limite));
}

/** Inicial (en %) usada la última vez, para proponerla. */
export async function ultimaInicialPct(db: BaseDatos): Promise<number | null> {
  const v = await leerPreferencia(db, CLAVE_ULTIMA_INICIAL);
  return v ? Number(v) : null;
}

/** Deuda total en cuotas, límite y disponible. */
export function resumenCuotas(compras: CompraCuotas[], limite: number | null) {
  const usado = compras.reduce((s, c) => s + c.pendiente, 0);
  const proximas = compras
    .filter((c) => c.proxima)
    .map((c) => ({ comercio: c.comercio, compra_id: c.id, cuota: c.proxima! }))
    .sort((a, b) => a.cuota.fecha.localeCompare(b.cuota.fecha));
  return { usado, limite, disponible: limite !== null ? Math.max(limite - usado, 0) : null, proxima: proximas[0] ?? null };
}
