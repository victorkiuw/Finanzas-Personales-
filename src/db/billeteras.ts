import { esMoneda, type Moneda } from '../lib/moneda';
import type { BaseDatos } from './tipos';

export interface Billetera {
  id: number;
  nombre: string;
  moneda: Moneda;
  /** Céntimos. */
  balance_inicial: number;
  icono: string;
  color_hex: string;
  archivada: boolean;
  /** Saldo actual en céntimos: balance inicial más todos los movimientos. */
  saldo: number;
  /** Comisión que cobra el banco al pagar desde esta billetera (p. ej. Pago Móvil). */
  comision_porcentaje: number;
  /** Céntimos. */
  comision_minima: number;
  /** % sobre la tasa BCV al que el banco vende/compra divisas; null si no se usa. */
  margen_cambio: number | null;
  /** Si su saldo se suma al total disponible (Binance como ahorro discreto, no). */
  en_total: boolean;
}

export interface DatosBilletera {
  nombre: string;
  moneda: Moneda;
  balance_inicial: number;
  icono: string;
  color_hex: string;
  comision_porcentaje?: number;
  comision_minima?: number;
  margen_cambio?: number | null;
  en_total?: boolean;
}

export const LARGO_MAXIMO_NOMBRE = 40;

export class ErrorValidacion extends Error {}

interface FilaBilletera extends Omit<Billetera, 'archivada' | 'en_total'> {
  archivada: number;
  en_total: number;
}

const SELECT_CON_SALDO = `
  SELECT b.id, b.nombre, b.moneda, b.balance_inicial, b.icono, b.color_hex, b.archivada,
    b.comision_porcentaje, b.comision_minima, b.margen_cambio, b.en_total,
    b.balance_inicial
    + COALESCE((
        SELECT SUM(CASE WHEN t.tipo IN ('INGRESO', 'RETIRO_META', 'PRESTAMO_RECIBIDO', 'COBRO_DEUDA')
                        THEN t.monto ELSE -t.monto END)
        FROM transacciones t WHERE t.billetera_origen_id = b.id), 0)
    + COALESCE((
        SELECT SUM(t.monto_destino)
        FROM transacciones t WHERE t.billetera_destino_id = b.id AND t.tipo = 'TRANSFERENCIA'), 0)
    AS saldo
  FROM billeteras b`;

function aBilletera(fila: FilaBilletera): Billetera {
  return { ...fila, archivada: fila.archivada === 1, en_total: fila.en_total === 1 };
}

function validar(datos: DatosBilletera): DatosBilletera {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new ErrorValidacion('El nombre es obligatorio.');
  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    throw new ErrorValidacion(`El nombre no puede superar ${LARGO_MAXIMO_NOMBRE} caracteres.`);
  }
  if (!esMoneda(datos.moneda)) throw new ErrorValidacion('Moneda inválida.');
  if (!Number.isSafeInteger(datos.balance_inicial)) {
    throw new ErrorValidacion('El saldo inicial no es válido.');
  }
  const comision_porcentaje = datos.comision_porcentaje ?? 0;
  const comision_minima = datos.comision_minima ?? 0;
  if (!(comision_porcentaje >= 0 && comision_porcentaje <= 20)) {
    throw new ErrorValidacion('La comisión debe estar entre 0 % y 20 %.');
  }
  if (!Number.isSafeInteger(comision_minima) || comision_minima < 0) {
    throw new ErrorValidacion('La comisión mínima no es válida.');
  }
  const margen_cambio = datos.margen_cambio ?? null;
  if (margen_cambio !== null && !(margen_cambio >= -50 && margen_cambio <= 100)) {
    throw new ErrorValidacion('El margen del banco debe estar entre -50 % y 100 %.');
  }
  return { ...datos, nombre, comision_porcentaje, comision_minima, margen_cambio, en_total: datos.en_total ?? true };
}

export async function listarBilleteras(
  db: BaseDatos,
  { incluirArchivadas = false }: { incluirArchivadas?: boolean } = {},
): Promise<Billetera[]> {
  const filas = await db.getAllAsync<FilaBilletera>(
    `${SELECT_CON_SALDO} ${incluirArchivadas ? '' : 'WHERE b.archivada = 0'}
     ORDER BY b.archivada, b.id`,
    [],
  );
  return filas.map(aBilletera);
}

export async function obtenerBilletera(db: BaseDatos, id: number): Promise<Billetera | null> {
  const fila = await db.getFirstAsync<FilaBilletera>(`${SELECT_CON_SALDO} WHERE b.id = ?`, [id]);
  return fila ? aBilletera(fila) : null;
}

export async function crearBilletera(db: BaseDatos, datos: DatosBilletera): Promise<number> {
  const d = validar(datos);
  const r = await db.runAsync(
    `INSERT INTO billeteras
       (nombre, moneda, balance_inicial, icono, color_hex, comision_porcentaje, comision_minima, margen_cambio, en_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.nombre, d.moneda, d.balance_inicial, d.icono, d.color_hex, d.comision_porcentaje!, d.comision_minima!, d.margen_cambio!, d.en_total ? 1 : 0],
  );
  return r.lastInsertRowId;
}

export async function contarMovimientos(db: BaseDatos, id: number): Promise<number> {
  const fila = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transacciones WHERE billetera_origen_id = ? OR billetera_destino_id = ?`,
    [id, id],
  );
  return fila?.n ?? 0;
}

/**
 * La moneda solo puede cambiarse mientras la billetera no tenga movimientos:
 * los montos registrados están expresados en su moneda original.
 */
export async function actualizarBilletera(
  db: BaseDatos,
  id: number,
  datos: DatosBilletera,
): Promise<void> {
  const d = validar(datos);
  const actual = await obtenerBilletera(db, id);
  if (!actual) throw new ErrorValidacion('La billetera no existe.');
  if (actual.moneda !== d.moneda && (await contarMovimientos(db, id)) > 0) {
    throw new ErrorValidacion('No se puede cambiar la moneda de una billetera con movimientos.');
  }
  await db.runAsync(
    `UPDATE billeteras SET nombre = ?, moneda = ?, balance_inicial = ?, icono = ?, color_hex = ?,
       comision_porcentaje = ?, comision_minima = ?, margen_cambio = ?, en_total = ? WHERE id = ?`,
    [d.nombre, d.moneda, d.balance_inicial, d.icono, d.color_hex, d.comision_porcentaje!, d.comision_minima!, d.margen_cambio!, d.en_total ? 1 : 0, id],
  );
}

export async function establecerArchivada(db: BaseDatos, id: number, archivada: boolean) {
  await db.runAsync(`UPDATE billeteras SET archivada = ? WHERE id = ?`, [archivada ? 1 : 0, id]);
}

/**
 * Elimina la billetera si no tiene movimientos. Si los tiene, la archiva para
 * no perder el historial.
 */
export async function eliminarBilletera(
  db: BaseDatos,
  id: number,
): Promise<'eliminada' | 'archivada'> {
  if ((await contarMovimientos(db, id)) > 0) {
    await establecerArchivada(db, id, true);
    return 'archivada';
  }
  await db.runAsync(`DELETE FROM billeteras WHERE id = ?`, [id]);
  return 'eliminada';
}

export const BILLETERAS_SUGERIDAS: DatosBilletera[] = [
  { nombre: 'Efectivo', moneda: 'USD', balance_inicial: 0, icono: 'cash', color_hex: '#2E7D32' },
  {
    nombre: 'Banco / Pago Móvil',
    moneda: 'BS',
    balance_inicial: 0,
    icono: 'bank',
    color_hex: '#1565C0',
    // Pago Móvil a persona según el BCV (ver lib/comision.ts).
    comision_porcentaje: 0.3,
    comision_minima: 1400,
  },
  { nombre: 'Binance', moneda: 'USDT', balance_inicial: 0, icono: 'bitcoin', color_hex: '#F9A825' },
];

export async function crearBilleterasSugeridas(db: BaseDatos): Promise<void> {
  for (const b of BILLETERAS_SUGERIDAS) await crearBilletera(db, b);
}

/** Suma de saldos agrupada por moneda (sin conversión; eso llega con las tasas). */
export function totalesPorMoneda(billeteras: Billetera[]): Partial<Record<Moneda, number>> {
  const totales: Partial<Record<Moneda, number>> = {};
  for (const b of billeteras) {
    if (b.archivada) continue;
    totales[b.moneda] = (totales[b.moneda] ?? 0) + b.saldo;
  }
  return totales;
}
