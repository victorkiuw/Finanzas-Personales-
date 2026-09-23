import { convertir, type Cambio } from '../lib/conversion';
import { claveDia } from '../lib/fechas';
import { equivalentes, type Moneda } from '../lib/moneda';
import { euroSegun } from './tasas';
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

type Historial = { dia: string; tasa: number }[];

/** Última tasa conocida en o antes del día; si el día es anterior a todo el historial, la más antigua. */
function buscarTasa(h: Historial, dia: string): number | null {
  if (h.length === 0) return null;
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

/** Historiales para convertir euros: el del euro BCV y el del dólar BCV (para la relación euro/dólar). */
export interface HistorialEuro {
  euro: Historial;
  bcv: Historial;
}

/** Busca las tasas de un día en el historial (ordenado por día). */
export class Conversor {
  constructor(
    private readonly historial: Historial,
    /** Tasas a usar si el historial está vacío (normalmente las vigentes). */
    private readonly respaldo: number | null,
    private readonly historialEuro: HistorialEuro | null = null,
    private readonly respaldoEuro: number | null = null,
  ) {}

  /** Bs. por dólar (según la referencia) del día. */
  tasaDelDia(dia: string): number | null {
    return buscarTasa(this.historial, dia) ?? this.respaldo;
  }

  cambioDelDia(dia: string): Cambio {
    const dolar = this.tasaDelDia(dia);
    const h = this.historialEuro;
    const euro = h ? euroSegun(dolar, buscarTasa(h.bcv, dia), buscarTasa(h.euro, dia)) : null;
    return { dolar, euro: euro ?? this.respaldoEuro };
  }

  /** Convierte a la moneda base; null si hace falta una tasa y no hay ninguna. */
  aBase(monto: number, moneda: Moneda, base: Moneda, fechaIso: string): number | null {
    if (equivalentes(moneda, base)) return monto;
    return convertir(monto, moneda, base, this.cambioDelDia(claveDia(fechaIso)));
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
  /** Clave del periodo (su inicio en ISO) o "AAAA-MM" en totalesPorMes. */
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

/** Ingresos y gastos en cada periodo [desde, hasta) indicado (días, semanas o meses). */
export function totalesPorPeriodo(
  filas: FilaReporte[],
  conversor: Conversor,
  base: Moneda,
  periodos: { desde: Date; hasta: Date }[],
): TotalMes[] {
  const totales = periodos.map((p) => ({ mes: p.desde.toISOString(), ingresos: 0, gastos: 0 }));
  for (const f of filas) {
    const t = Date.parse(f.fecha);
    const i = periodos.findIndex((p) => t >= p.desde.getTime() && t < p.hasta.getTime());
    const monto = i >= 0 ? conversor.aBase(f.monto, f.moneda, base, f.fecha) : null;
    if (monto === null) continue;
    if (f.tipo === 'INGRESO') totales[i].ingresos += monto;
    else totales[i].gastos += monto;
  }
  return totales;
}

export interface PuntoPatrimonio {
  /** "AAAA-MM". */
  mes: string;
  /** Disponible al cierre del mes (billeteras que cuentan en el total), en la moneda base. */
  total: number;
  /** Faltó una tasa para convertir lo que había en otra moneda. */
  incompleto: boolean;
}

/**
 * Disponible al cierre de cada mes: saldos iniciales más todos los movimientos
 * hasta esa fecha, por moneda, convertidos con las tasas del último día del mes.
 * Igual que el total de Inicio, no cuenta lo ahorrado en metas ni las
 * billeteras marcadas para no contar en el total.
 */
export async function patrimonioPorMes(
  db: BaseDatos,
  meses: string[],
  conversor: Conversor,
  base: Moneda,
): Promise<PuntoPatrimonio[]> {
  const cortes = meses.map((mes) => {
    const [a, m] = mes.split('-').map(Number);
    return new Date(a, m, 1); // primer instante del mes siguiente (local)
  });
  const puntos = await disponibleAl(db, cortes, conversor, base);
  return puntos.map((p, i) => ({ ...p, mes: meses[i] }));
}

/** Disponible justo antes de cada corte (ordenados), con las tasas del instante anterior al corte. */
export async function disponibleAl(
  db: BaseDatos,
  cortes: Date[],
  conversor: Conversor,
  base: Moneda,
): Promise<PuntoPatrimonio[]> {
  const iniciales = await db.getAllAsync<{ moneda: Moneda; total: number }>(
    `SELECT moneda, SUM(balance_inicial) AS total FROM billeteras WHERE en_total = 1 GROUP BY moneda`,
    [],
  );
  // Cada movimiento como cambio por moneda en las billeteras que cuentan.
  const cambios = await db.getAllAsync<{ fecha: string; moneda: Moneda; delta: number }>(
    `SELECT t.fecha, o.moneda,
       CASE WHEN t.tipo IN ('INGRESO', 'RETIRO_META', 'PRESTAMO_RECIBIDO', 'COBRO_DEUDA') THEN t.monto ELSE -t.monto END AS delta
     FROM transacciones t JOIN billeteras o ON o.id = t.billetera_origen_id
     WHERE o.en_total = 1
     UNION ALL
     SELECT t.fecha, d.moneda, t.monto_destino
     FROM transacciones t JOIN billeteras d ON d.id = t.billetera_destino_id
     WHERE t.tipo = 'TRANSFERENCIA' AND d.en_total = 1
     ORDER BY 1`,
    [],
  );

  const saldo: Partial<Record<Moneda, number>> = {};
  for (const i of iniciales) saldo[i.moneda] = i.total;
  const puntos: PuntoPatrimonio[] = [];
  let k = 0;
  for (const corte of cortes) {
    const limite = corte.toISOString();
    while (k < cambios.length && cambios[k].fecha < limite) {
      const c = cambios[k++];
      saldo[c.moneda] = (saldo[c.moneda] ?? 0) + c.delta;
    }
    const ultimoDia = new Date(corte.getTime() - 1).toISOString();
    let total = 0;
    let incompleto = false;
    for (const [moneda, monto] of Object.entries(saldo) as [Moneda, number][]) {
      const v = conversor.aBase(monto, moneda, base, ultimoDia);
      if (v === null) incompleto = true;
      else total += v;
    }
    puntos.push({ mes: limite, total, incompleto });
  }
  return puntos;
}

/**
 * Cuánto valor en dólares perdieron tus bolívares en el periodo por la subida
 * de la tasa: cada día, lo que tenías en Bs. vale menos dólares que el día
 * anterior. Se cuentan todas las billeteras en bolívares. Devuelve céntimos de
 * dólar (positivo = pérdida) y la subida de la tasa en el periodo (%).
 */
export async function perdidaPorDevaluacion(
  db: BaseDatos,
  historial: Historial,
  desde: Date,
  hasta: Date,
): Promise<{ perdida: number; subida: number | null; saldoBs: number }> {
  const inicial = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(balance_inicial) AS total FROM billeteras WHERE moneda = 'BS'`,
    [],
  );
  const cambios = await db.getAllAsync<{ fecha: string; delta: number }>(
    `SELECT t.fecha,
       CASE WHEN t.tipo IN ('INGRESO', 'RETIRO_META', 'PRESTAMO_RECIBIDO', 'COBRO_DEUDA') THEN t.monto ELSE -t.monto END AS delta
     FROM transacciones t JOIN billeteras o ON o.id = t.billetera_origen_id WHERE o.moneda = 'BS'
     UNION ALL
     SELECT t.fecha, t.monto_destino FROM transacciones t JOIN billeteras d ON d.id = t.billetera_destino_id
     WHERE t.tipo = 'TRANSFERENCIA' AND d.moneda = 'BS'
     ORDER BY 1`,
    [],
  );
  let saldo = inicial?.total ?? 0;
  let k = 0;
  const hastaIso = (d: Date) => d.toISOString();
  // Saldo en Bs. al empezar el periodo.
  while (k < cambios.length && cambios[k].fecha < hastaIso(desde)) saldo += cambios[k++].delta;

  let perdida = 0;
  const dia = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  let tasaPrevia = buscarTasa(historial, claveDia(new Date(dia.getTime() - 1).toISOString()));
  const tasaInicio = tasaPrevia;
  let tasaFin = tasaPrevia;
  while (dia < hasta) {
    const tasa = buscarTasa(historial, claveDia(dia.toISOString()));
    if (tasa && tasaPrevia && saldo > 0) perdida += saldo / tasaPrevia - saldo / tasa;
    if (tasa) {
      tasaPrevia = tasa;
      tasaFin = tasa;
    }
    const siguiente = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1);
    while (k < cambios.length && cambios[k].fecha < hastaIso(siguiente)) saldo += cambios[k++].delta;
    dia.setDate(dia.getDate() + 1);
  }
  const subida = tasaInicio && tasaFin ? (tasaFin / tasaInicio - 1) * 100 : null;
  return { perdida: Math.round(perdida), subida, saldoBs: saldo };
}
