import { convertir } from '../lib/conversion';
import { claveDia } from '../lib/fechas';
import type { Moneda } from '../lib/moneda';
import type { BaseDatos } from './tipos';

/*
 * Los reportes suman ingresos y gastos de billeteras en distintas monedas.
 * Cada movimiento se convierte a la moneda base con la tasa de SU día (del
 * historial), para que la devaluación no infle ni encoja los meses pasados.
 * Transferencias y movimientos de metas no cuentan como ingreso ni gasto.
 */

export interface FilaReporte {
  fecha: string;
  tipo: 'GASTO' | 'INGRESO';
  monto: number;
  moneda: Moneda;
  categoria_id: number;
  categoria_nombre: string;
  categoria_icono: string;
  categoria_color: string;
}

export async function filasDeReporte(db: BaseDatos, desde: string, hasta: string): Promise<FilaReporte[]> {
  return db.getAllAsync<FilaReporte>(
    `SELECT t.fecha, t.tipo, t.monto, o.moneda, t.categoria_id,
       c.nombre AS categoria_nombre, c.icono AS categoria_icono, c.color_hex AS categoria_color
     FROM transacciones t
     JOIN billeteras o ON o.id = t.billetera_origen_id
     JOIN categorias c ON c.id = t.categoria_id
     WHERE t.tipo IN ('GASTO', 'INGRESO') AND t.fecha >= ? AND t.fecha < ?`,
    [desde, hasta],
  );
}

/** Busca la tasa de un día en el historial (ordenado por día). */
export class Conversor {
  constructor(
    private readonly historial: { dia: string; tasa: number }[],
    /** Tasa a usar si el historial está vacío (normalmente la vigente). */
    private readonly respaldo: number | null,
  ) {}

  /** Última tasa conocida en o antes del día; si el día es anterior a todo el historial, la más antigua. */
  tasaDelDia(dia: string): number | null {
    const h = this.historial;
    if (h.length === 0) return this.respaldo;
    let lo = 0;
    let hi = h.length - 1;
    let encontrada = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (h[mid].dia <= dia) {
        encontrada = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return h[Math.max(encontrada, 0)].tasa;
  }

  /** Convierte a la moneda base; null si hace falta una tasa y no hay ninguna. */
  aBase(monto: number, moneda: Moneda, base: Moneda, fechaIso: string): number | null {
    if (moneda === base || (moneda !== 'BS' && base !== 'BS')) return convertir(monto, moneda, base, 1);
    const tasa = this.tasaDelDia(claveDia(fechaIso));
    return tasa ? convertir(monto, moneda, base, tasa) : null;
  }
}

export interface TotalCategoria {
  id: number;
  nombre: string;
  icono: string;
  color: string;
  total: number;
}

export interface ResumenPeriodo {
  ingresos: number;
  gastos: number;
  balance: number;
  /** Gastos por categoría, de mayor a menor. */
  gastosPorCategoria: TotalCategoria[];
  /** Hubo movimientos que no se pudieron convertir por falta de tasa. */
  incompleto: boolean;
}

export function resumirPeriodo(filas: FilaReporte[], conversor: Conversor, base: Moneda): ResumenPeriodo {
  let ingresos = 0;
  let gastos = 0;
  let incompleto = false;
  const categorias = new Map<number, TotalCategoria>();
  for (const f of filas) {
    const monto = conversor.aBase(f.monto, f.moneda, base, f.fecha);
    if (monto === null) {
      incompleto = true;
      continue;
    }
    if (f.tipo === 'INGRESO') {
      ingresos += monto;
      continue;
    }
    gastos += monto;
    const c = categorias.get(f.categoria_id) ?? {
      id: f.categoria_id,
      nombre: f.categoria_nombre,
      icono: f.categoria_icono,
      color: f.categoria_color,
      total: 0,
    };
    c.total += monto;
    categorias.set(f.categoria_id, c);
  }
  return {
    ingresos,
    gastos,
    balance: ingresos - gastos,
    gastosPorCategoria: [...categorias.values()].sort((a, b) => b.total - a.total),
    incompleto,
  };
}

export interface TotalMes {
  /** "AAAA-MM" local. */
  mes: string;
  ingresos: number;
  gastos: number;
}

/** Ingresos y gastos por mes para los meses indicados (en ese orden), aunque estén vacíos. */
export function totalesPorMes(
  filas: FilaReporte[],
  conversor: Conversor,
  base: Moneda,
  meses: string[],
): TotalMes[] {
  const porMes = new Map(meses.map((mes) => [mes, { mes, ingresos: 0, gastos: 0 }]));
  for (const f of filas) {
    const t = porMes.get(claveDia(f.fecha).slice(0, 7));
    const monto = conversor.aBase(f.monto, f.moneda, base, f.fecha);
    if (!t || monto === null) continue;
    if (f.tipo === 'INGRESO') t.ingresos += monto;
    else t.gastos += monto;
  }
  return meses.map((m) => porMes.get(m)!);
}

export interface PuntoPatrimonio {
  /** "AAAA-MM". */
  mes: string;
  /** Patrimonio al cierre del mes (billeteras + metas), en la moneda base. */
  total: number;
  /** Faltó una tasa para convertir lo que había en Bs. */
  incompleto: boolean;
}

/**
 * Patrimonio al cierre de cada mes: saldos iniciales más todos los movimientos
 * hasta esa fecha, por moneda, convertidos con la tasa del último día del mes.
 * Las metas cuentan como parte del patrimonio (igual que en el resumen).
 */
export async function patrimonioPorMes(
  db: BaseDatos,
  meses: string[],
  conversor: Conversor,
  base: Moneda,
): Promise<PuntoPatrimonio[]> {
  const iniciales = await db.getAllAsync<{ moneda: Moneda; total: number }>(
    `SELECT moneda, SUM(balance_inicial) AS total FROM billeteras GROUP BY moneda`,
    [],
  );
  // Cada movimiento como cambios por moneda: lo que sale/entra de billeteras y metas.
  const cambios = await db.getAllAsync<{ fecha: string; moneda: Moneda; delta: number }>(
    `SELECT t.fecha, o.moneda,
       CASE WHEN t.tipo IN ('INGRESO', 'RETIRO_META', 'PRESTAMO_RECIBIDO', 'COBRO_DEUDA') THEN t.monto ELSE -t.monto END AS delta
     FROM transacciones t JOIN billeteras o ON o.id = t.billetera_origen_id
     UNION ALL
     SELECT t.fecha, d.moneda, t.monto_destino
     FROM transacciones t JOIN billeteras d ON d.id = t.billetera_destino_id WHERE t.tipo = 'TRANSFERENCIA'
     UNION ALL
     SELECT t.fecha, m.moneda, CASE WHEN t.tipo = 'APORTE_META' THEN t.monto_destino ELSE -t.monto_destino END
     FROM transacciones t JOIN metas_ahorro m ON m.id = t.meta_id
     ORDER BY 1`,
    [],
  );

  const saldo: Partial<Record<Moneda, number>> = {};
  for (const i of iniciales) saldo[i.moneda] = i.total;
  const puntos: PuntoPatrimonio[] = [];
  let k = 0;
  for (const mes of meses) {
    const [a, m] = mes.split('-').map(Number);
    const finMes = new Date(a, m, 1); // primer instante del mes siguiente (local)
    const limite = finMes.toISOString();
    while (k < cambios.length && cambios[k].fecha < limite) {
      const c = cambios[k++];
      saldo[c.moneda] = (saldo[c.moneda] ?? 0) + c.delta;
    }
    const ultimoDia = new Date(finMes.getTime() - 1).toISOString();
    let total = 0;
    let incompleto = false;
    for (const [moneda, monto] of Object.entries(saldo) as [Moneda, number][]) {
      const v = conversor.aBase(monto, moneda, base, ultimoDia);
      if (v === null) incompleto = true;
      else total += v;
    }
    puntos.push({ mes, total, incompleto });
  }
  return puntos;
}
