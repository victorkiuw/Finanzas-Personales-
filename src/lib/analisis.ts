import { claveDia } from './fechas';
import type { Conversor, FilaReporte } from '../db/reportes';
import type { Moneda } from './moneda';

/*
 * Análisis del mes para Inicio: pronóstico, comparación con el mes pasado,
 * gastos hormiga, fijos vs. variables y etiquetas (#viaje) en las notas.
 */

export interface Pronostico {
  diasTranscurridos: number;
  diasRestantes: number;
  /** Gasto promedio por día hasta hoy. */
  porDia: number;
  /** Lo que se gastaría en los días que faltan a este ritmo. */
  gastoRestante: number;
  /** Disponible estimado al terminar el mes (sin contar ingresos futuros). */
  finDeMes: number;
  /** Máximo por día para no quedarse en cero (incluye hoy). */
  maximoPorDia: number;
}

/** Pronóstico del mes en curso a partir de lo gastado y lo disponible hoy. */
export function pronosticoMes(gastado: number, disponible: number, hoy = new Date()): Pronostico {
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasTranscurridos = hoy.getDate();
  const diasRestantes = diasMes - diasTranscurridos;
  const porDia = Math.round(gastado / Math.max(diasTranscurridos, 1));
  const gastoRestante = porDia * diasRestantes;
  return {
    diasTranscurridos,
    diasRestantes,
    porDia,
    gastoRestante,
    finDeMes: disponible - gastoRestante,
    maximoPorDia: Math.max(Math.round(disponible / (diasRestantes + 1)), 0),
  };
}

/** Variación porcentual entre dos montos; null si antes no hubo nada. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

export interface Hormiga {
  cantidad: number;
  total: number;
  /** Categorías donde más se van, de mayor a menor. */
  categorias: { nombre: string; total: number; cantidad: number }[];
}

/**
 * Gastos hormiga: los gastos pequeños (hasta `umbral` en la moneda base) que,
 * sumados, pesan. Solo cuenta si son varios.
 */
export function gastosHormiga(filas: FilaReporte[], conversor: Conversor, base: Moneda, umbral: number): Hormiga {
  const porCategoria = new Map<string, { nombre: string; total: number; cantidad: number }>();
  let cantidad = 0;
  let total = 0;
  for (const f of filas) {
    if (f.tipo !== 'GASTO' || f.categoria_fija) continue;
    const monto = conversor.aBase(f.monto, f.moneda, base, f.fecha);
    if (monto === null || monto > umbral) continue;
    cantidad++;
    total += monto;
    const c = porCategoria.get(f.categoria_nombre) ?? { nombre: f.categoria_nombre, total: 0, cantidad: 0 };
    c.total += monto;
    c.cantidad++;
    porCategoria.set(f.categoria_nombre, c);
  }
  return { cantidad, total, categorias: [...porCategoria.values()].sort((a, b) => b.total - a.total) };
}

/** Gastos fijos y variables del periodo, en la moneda base. */
export function fijosVariables(filas: FilaReporte[], conversor: Conversor, base: Moneda): { fijos: number; variables: number } {
  let fijos = 0;
  let variables = 0;
  for (const f of filas) {
    if (f.tipo !== 'GASTO') continue;
    const monto = conversor.aBase(f.monto, f.moneda, base, f.fecha);
    if (monto === null) continue;
    if (f.categoria_fija) fijos += monto;
    else variables += monto;
  }
  return { fijos, variables };
}

/** Etiquetas (#viaje, #moto…) de una nota, en minúsculas y sin repetir. */
export function extraerEtiquetas(nota: string | null | undefined): string[] {
  if (!nota) return [];
  const encontradas = nota.match(/#[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(encontradas.map((e) => e.toLowerCase()))];
}

export interface TotalEtiqueta {
  etiqueta: string;
  gastos: number;
  ingresos: number;
  cantidad: number;
  ultima: string;
}

/** Total por etiqueta en la moneda base, de la más usada a la menos. */
export function totalesPorEtiqueta(filas: FilaReporte[], conversor: Conversor, base: Moneda): TotalEtiqueta[] {
  const mapa = new Map<string, TotalEtiqueta>();
  for (const f of filas) {
    const etiquetas = extraerEtiquetas(f.nota);
    if (etiquetas.length === 0) continue;
    const monto = conversor.aBase(f.monto, f.moneda, base, f.fecha) ?? 0;
    for (const e of etiquetas) {
      const t = mapa.get(e) ?? { etiqueta: e, gastos: 0, ingresos: 0, cantidad: 0, ultima: '' };
      if (f.tipo === 'GASTO') t.gastos += monto;
      else t.ingresos += monto;
      t.cantidad++;
      if (claveDia(f.fecha) > t.ultima) t.ultima = claveDia(f.fecha);
      mapa.set(e, t);
    }
  }
  return [...mapa.values()].sort((a, b) => b.ultima.localeCompare(a.ultima) || b.cantidad - a.cantidad);
}
