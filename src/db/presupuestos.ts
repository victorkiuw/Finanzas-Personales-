import { esMoneda, type Moneda } from '../lib/moneda';
import { ErrorValidacion } from './billeteras';
import type { Conversor, FilaReporte } from './reportes';
import type { BaseDatos } from './tipos';

/** Límite mensual de gasto para una categoría, en la moneda que elija el usuario. */
export interface Presupuesto {
  categoria_id: number;
  monto: number;
  moneda: Moneda;
}

export async function listarPresupuestos(db: BaseDatos): Promise<Presupuesto[]> {
  return db.getAllAsync<Presupuesto>(`SELECT categoria_id, monto, moneda FROM presupuestos`, []);
}

export async function guardarPresupuesto(db: BaseDatos, p: Presupuesto): Promise<void> {
  if (!Number.isSafeInteger(p.monto) || p.monto <= 0) throw new ErrorValidacion('El presupuesto debe ser mayor que cero.');
  if (!esMoneda(p.moneda)) throw new ErrorValidacion('Moneda inválida.');
  const cat = await db.getFirstAsync<{ tipo: string }>(`SELECT tipo FROM categorias WHERE id = ?`, [p.categoria_id]);
  if (!cat || cat.tipo !== 'GASTO') throw new ErrorValidacion('Solo las categorías de gasto llevan presupuesto.');
  await db.runAsync(
    `INSERT INTO presupuestos (categoria_id, monto, moneda) VALUES (?, ?, ?)
     ON CONFLICT (categoria_id) DO UPDATE SET monto = excluded.monto, moneda = excluded.moneda`,
    [p.categoria_id, p.monto, p.moneda],
  );
}

export async function eliminarPresupuesto(db: BaseDatos, categoriaId: number): Promise<void> {
  await db.runAsync(`DELETE FROM presupuestos WHERE categoria_id = ?`, [categoriaId]);
}

/** Desde qué fracción del límite se avisa. */
export const UMBRAL_ALERTA = 0.8;

export interface EstadoPresupuesto extends Presupuesto {
  nombre: string;
  icono: string;
  color: string;
  /** Gastado en el mes, en la moneda del presupuesto. */
  gastado: number;
  fraccion: number;
  estado: 'ok' | 'alerta' | 'excedido';
}

/**
 * Cuánto se lleva gastado de cada presupuesto con los movimientos del mes. Cada
 * gasto se convierte a la moneda del presupuesto con la tasa de su día.
 */
export function estadoPresupuestos(
  presupuestos: Presupuesto[],
  categorias: { id: number; nombre: string; icono: string; color_hex: string }[],
  filasDelMes: FilaReporte[],
  conversor: Conversor,
): EstadoPresupuesto[] {
  const resultado: EstadoPresupuesto[] = [];
  for (const p of presupuestos) {
    const cat = categorias.find((c) => c.id === p.categoria_id);
    if (!cat) continue;
    let gastado = 0;
    for (const f of filasDelMes) {
      if (f.tipo !== 'GASTO' || f.categoria_id !== p.categoria_id) continue;
      gastado += conversor.aBase(f.monto, f.moneda, p.moneda, f.fecha) ?? 0;
    }
    const fraccion = gastado / p.monto;
    resultado.push({
      ...p,
      nombre: cat.nombre,
      icono: cat.icono,
      color: cat.color_hex,
      gastado,
      fraccion,
      estado: fraccion > 1 ? 'excedido' : fraccion >= UMBRAL_ALERTA ? 'alerta' : 'ok',
    });
  }
  // Primero los que más preocupan.
  return resultado.sort((a, b) => b.fraccion - a.fraccion);
}
