import type { Moneda } from '../lib/moneda';
import { ErrorValidacion } from './billeteras';
import { crearMovimiento } from './movimientos';
import type { BaseDatos } from './tipos';

/*
 * Movimientos que se repiten. Los automáticos se registran solos al abrir la
 * app en su fecha; los demás quedan "pendientes por confirmar" (por si el monto
 * cambia, como la luz). Quincenal = el 15 y el último día de cada mes.
 */

export type Frecuencia = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';

export const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = {
  SEMANAL: 'Cada semana',
  QUINCENAL: 'Cada quincena (15 y fin de mes)',
  MENSUAL: 'Cada mes',
};

export interface Recurrente {
  id: number;
  nombre: string;
  tipo: 'GASTO' | 'INGRESO';
  monto: number;
  billetera_id: number;
  categoria_id: number;
  frecuencia: Frecuencia;
  dia_ancla: number;
  /** "AAAA-MM-DD". */
  proxima_fecha: string;
  automatico: boolean;
  activo: boolean;
  billetera_nombre: string;
  billetera_moneda: Moneda;
  categoria_icono: string;
  categoria_color: string;
}

export interface DatosRecurrente {
  nombre: string;
  tipo: 'GASTO' | 'INGRESO';
  monto: number;
  billetera_id: number;
  categoria_id: number;
  frecuencia: Frecuencia;
  proxima_fecha: string;
  automatico: boolean;
}

const diasDelMes = (a: number, m: number) => new Date(a, m + 1, 0).getDate();
const clave = (a: number, m: number, d: number) =>
  `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Fecha siguiente a `fecha` ("AAAA-MM-DD") según la frecuencia. Mensual respeta el día original (31 → 30 → 28…). */
export function siguienteFecha(fecha: string, frecuencia: Frecuencia, diaAncla: number): string {
  const [a, m1, d] = fecha.split('-').map(Number);
  const m = m1 - 1;
  if (frecuencia === 'SEMANAL') {
    const f = new Date(a, m, d + 7);
    return clave(f.getFullYear(), f.getMonth(), f.getDate());
  }
  if (frecuencia === 'QUINCENAL') {
    const ultimo = diasDelMes(a, m);
    if (d < 15) return clave(a, m, 15);
    if (d < ultimo) return clave(a, m, ultimo);
    const sig = new Date(a, m + 1, 1);
    return clave(sig.getFullYear(), sig.getMonth(), 15);
  }
  const sig = new Date(a, m + 1, 1);
  return clave(sig.getFullYear(), sig.getMonth(), Math.min(diaAncla, diasDelMes(sig.getFullYear(), sig.getMonth())));
}

export function claveHoy(hoy = new Date()): string {
  return clave(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
}

type Fila = Omit<Recurrente, 'automatico' | 'activo'> & { automatico: number; activo: number };

const SELECT = `
  SELECT r.*, b.nombre AS billetera_nombre, b.moneda AS billetera_moneda,
    c.icono AS categoria_icono, c.color_hex AS categoria_color
  FROM recurrentes r
  JOIN billeteras b ON b.id = r.billetera_id
  JOIN categorias c ON c.id = r.categoria_id`;

const aRecurrente = (f: Fila): Recurrente => ({ ...f, automatico: f.automatico === 1, activo: f.activo === 1 });

export async function listarRecurrentes(db: BaseDatos): Promise<Recurrente[]> {
  return (await db.getAllAsync<Fila>(`${SELECT} ORDER BY r.activo DESC, r.proxima_fecha, r.id`, [])).map(aRecurrente);
}

export async function obtenerRecurrente(db: BaseDatos, id: number): Promise<Recurrente | null> {
  const f = await db.getFirstAsync<Fila>(`${SELECT} WHERE r.id = ?`, [id]);
  return f ? aRecurrente(f) : null;
}

async function validar(db: BaseDatos, d: DatosRecurrente): Promise<DatosRecurrente> {
  const nombre = d.nombre.trim();
  if (!nombre) throw new ErrorValidacion('Ponle un nombre (p. ej. "Internet").');
  if (!Number.isSafeInteger(d.monto) || d.monto <= 0) throw new ErrorValidacion('El monto debe ser mayor que cero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.proxima_fecha)) throw new ErrorValidacion('La fecha no es válida.');
  if (!['SEMANAL', 'QUINCENAL', 'MENSUAL'].includes(d.frecuencia)) throw new ErrorValidacion('Frecuencia inválida.');
  const cat = await db.getFirstAsync<{ tipo: string }>(`SELECT tipo FROM categorias WHERE id = ?`, [d.categoria_id]);
  if (!cat || cat.tipo !== d.tipo) throw new ErrorValidacion('Elige una categoría del tipo correcto.');
  const b = await db.getFirstAsync<{ id: number }>(`SELECT id FROM billeteras WHERE id = ? AND archivada = 0`, [d.billetera_id]);
  if (!b) throw new ErrorValidacion('Elige una billetera activa.');
  return { ...d, nombre };
}

export async function crearRecurrente(db: BaseDatos, datos: DatosRecurrente): Promise<number> {
  const d = await validar(db, datos);
  const r = await db.runAsync(
    `INSERT INTO recurrentes (nombre, tipo, monto, billetera_id, categoria_id, frecuencia, dia_ancla, proxima_fecha, automatico)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.nombre, d.tipo, d.monto, d.billetera_id, d.categoria_id, d.frecuencia, Number(d.proxima_fecha.slice(8)), d.proxima_fecha, d.automatico ? 1 : 0],
  );
  return r.lastInsertRowId;
}

export async function actualizarRecurrente(db: BaseDatos, id: number, datos: DatosRecurrente & { activo: boolean }): Promise<void> {
  const d = await validar(db, datos);
  await db.runAsync(
    `UPDATE recurrentes SET nombre = ?, tipo = ?, monto = ?, billetera_id = ?, categoria_id = ?, frecuencia = ?,
       dia_ancla = ?, proxima_fecha = ?, automatico = ?, activo = ? WHERE id = ?`,
    [d.nombre, d.tipo, d.monto, d.billetera_id, d.categoria_id, d.frecuencia, Number(d.proxima_fecha.slice(8)), d.proxima_fecha,
      d.automatico ? 1 : 0, datos.activo ? 1 : 0, id],
  );
}

export async function eliminarRecurrente(db: BaseDatos, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM recurrentes WHERE id = ?`, [id]);
}

/** Mediodía local del día indicado, en ISO (evita que cambie de día por zona horaria). */
function fechaDelDia(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d, 12).toISOString();
}

async function avanzar(db: BaseDatos, r: Recurrente) {
  await db.runAsync(`UPDATE recurrentes SET proxima_fecha = ? WHERE id = ?`, [
    siguienteFecha(r.proxima_fecha, r.frecuencia, r.dia_ancla),
    r.id,
  ]);
}

/** Registra el movimiento de la fecha pendiente (con otro monto si cambió) y pasa a la siguiente. */
export async function confirmarRecurrente(db: BaseDatos, id: number, monto?: number): Promise<void> {
  const r = await obtenerRecurrente(db, id);
  if (!r) throw new ErrorValidacion('No existe.');
  await crearMovimiento(db, {
    tipo: r.tipo,
    monto: monto ?? r.monto,
    fecha: fechaDelDia(r.proxima_fecha),
    billetera_origen_id: r.billetera_id,
    categoria_id: r.categoria_id,
    nota: r.nombre,
  });
  await avanzar(db, r);
}

/** Salta la fecha pendiente sin registrar nada. */
export async function saltarRecurrente(db: BaseDatos, id: number): Promise<void> {
  const r = await obtenerRecurrente(db, id);
  if (r) await avanzar(db, r);
}

/**
 * Al abrir la app: registra los automáticos vencidos (todas las fechas
 * atrasadas, hasta 24) y devuelve los manuales que esperan confirmación.
 */
export async function procesarRecurrentes(db: BaseDatos, hoy = new Date()): Promise<{ creados: number; pendientes: Recurrente[] }> {
  const dia = claveHoy(hoy);
  let creados = 0;
  const pendientes: Recurrente[] = [];
  for (const r of await listarRecurrentes(db)) {
    if (!r.activo || r.proxima_fecha > dia) continue;
    if (!r.automatico) {
      pendientes.push(r);
      continue;
    }
    for (let i = 0, actual: Recurrente | null = r; i < 24 && actual && actual.proxima_fecha <= dia; i++) {
      await confirmarRecurrente(db, actual.id);
      creados++;
      actual = await obtenerRecurrente(db, r.id);
    }
  }
  return { creados, pendientes };
}
