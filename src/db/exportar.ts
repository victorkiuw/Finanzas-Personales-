import { formatearNumero } from '../lib/moneda';
import { listarMovimientos, type Movimiento } from './movimientos';
import type { BaseDatos } from './tipos';

/*
 * Exportación de movimientos a CSV para Excel / Google Sheets. Se usa ";" como
 * separador y coma decimal (formato de Excel en español) y BOM UTF-8 para que
 * los acentos se vean bien.
 */

const NOMBRE_TIPO: Record<string, string> = {
  GASTO: 'Gasto',
  INGRESO: 'Ingreso',
  TRANSFERENCIA: 'Transferencia',
  APORTE_META: 'Aporte a meta',
  RETIRO_META: 'Retiro de meta',
  PRESTAMO_DADO: 'Préstamo dado',
  PRESTAMO_RECIBIDO: 'Préstamo recibido',
  COBRO_DEUDA: 'Cobro de deuda',
  PAGO_DEUDA: 'Pago de deuda',
};

function celda(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Monto en céntimos a número con coma decimal y sin separador de miles (Excel lo reconoce como número). */
function numero(centimos: number | null): string {
  if (centimos === null) return '';
  return formatearNumero(centimos).replace(/\./g, '');
}

export function movimientosACsv(movs: Movimiento[]): string {
  const encabezado = ['Fecha', 'Hora', 'Tipo', 'Categoría', 'Billetera', 'Moneda', 'Monto', 'Destino', 'Moneda destino', 'Monto destino', 'Tasa', 'Meta / persona', 'Nota'];
  const filas = movs.map((m) => {
    const d = new Date(m.fecha);
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const signo = ['INGRESO', 'RETIRO_META', 'PRESTAMO_RECIBIDO', 'COBRO_DEUDA'].includes(m.tipo) ? 1 : -1;
    return [
      fecha,
      hora,
      NOMBRE_TIPO[m.tipo] ?? m.tipo,
      m.categoria_nombre,
      m.origen_nombre,
      m.origen_moneda,
      numero(signo * m.monto),
      m.destino_nombre,
      m.destino_moneda,
      m.tipo === 'TRANSFERENCIA' ? numero(m.monto_destino) : '',
      m.tasa_cambio === null ? '' : String(m.tasa_cambio).replace('.', ','),
      m.meta_nombre ?? m.deuda_persona,
      m.nota,
    ].map(celda).join(';');
  });
  return '﻿' + [encabezado.join(';'), ...filas].join('\r\n');
}

/** Todos los movimientos (o los de un rango [desde, hasta)), del más antiguo al más reciente. */
export async function exportarMovimientosCsv(db: BaseDatos, desde?: string, hasta?: string): Promise<{ csv: string; cantidad: number }> {
  const movs = await listarMovimientos(db, { desde, hasta, limite: 1_000_000 });
  movs.reverse();
  return { csv: movimientosACsv(movs), cantidad: movs.length };
}

/** De una lista de nombres de copias automáticas ("auto-AAAA-MM-DD.json"), las que sobran (se conservan las `mantener` más nuevas). */
export function copiasSobrantes(nombres: string[], mantener = 7): string[] {
  return nombres
    .filter((n) => /^auto-\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort()
    .reverse()
    .slice(mantener);
}
