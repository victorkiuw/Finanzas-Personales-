import { listarCompras, type CompraCuotas } from '../db/cuotas';
import { listarDeudas, type Deuda } from '../db/deudas';
import { listarMetas, type Meta } from '../db/metas';
import { claveHoy, listarRecurrentes, siguienteFecha, type Recurrente } from '../db/recurrentes';
import type { BaseDatos } from '../db/tipos';
import type { Moneda } from './moneda';

/** Algo que va a pasar en una fecha: un recurrente, una cuota, una deuda que vence o una meta. */
export interface Evento {
  /** "AAAA-MM-DD". */
  fecha: string;
  titulo: string;
  detalle: string;
  monto: number;
  moneda: Moneda;
  /** Entra dinero, sale dinero o es una meta (ni una ni otra). */
  sentido: 'entra' | 'sale' | 'meta';
  icono: string;
  ruta: string;
}

/** Lo que viene entre hoy y `hasta` (incluidos), ordenado por fecha. */
export function proximosEventos(
  datos: { recurrentes: Recurrente[]; compras: CompraCuotas[]; deudas: Deuda[]; metas: Meta[] },
  hoy: string,
  hasta: string,
): Evento[] {
  const eventos: Evento[] = [];
  for (const r of datos.recurrentes) {
    if (!r.activo) continue;
    let f = r.proxima_fecha;
    // Las atrasadas se muestran hoy; luego las siguientes repeticiones dentro del plazo.
    for (let i = 0; i < 60 && f <= hasta; i++) {
      eventos.push({
        fecha: f < hoy ? hoy : f,
        titulo: r.nombre,
        detalle: `${r.tipo === 'INGRESO' ? 'Ingreso' : r.tipo === 'APORTE_META' ? 'Aporte a meta' : 'Gasto'} recurrente · ${r.billetera_nombre}`,
        monto: r.monto,
        moneda: r.billetera_moneda,
        sentido: r.tipo === 'INGRESO' ? 'entra' : r.tipo === 'APORTE_META' ? 'meta' : 'sale',
        icono: r.tipo === 'APORTE_META' ? 'piggy-bank' : r.categoria_icono || 'calendar-refresh',
        ruta: `/recurrente/${r.id}`,
      });
      f = siguienteFecha(f, r.frecuencia, r.dia_ancla);
    }
  }
  for (const c of datos.compras) {
    for (const q of c.calendario) {
      if (q.pagada || q.fecha > hasta) continue;
      eventos.push({
        fecha: q.fecha < hoy ? hoy : q.fecha,
        titulo: `Cuota ${q.numero} · ${c.comercio}`,
        detalle: q.fecha < hoy ? 'Cashea · atrasada' : 'Cashea',
        monto: q.monto,
        moneda: 'USD',
        sentido: 'sale',
        icono: 'cart-outline',
        ruta: `/cuota/${c.id}`,
      });
    }
  }
  for (const d of datos.deudas) {
    if (d.cerrada || d.pendiente <= 0 || !d.fecha_limite || d.ajeno || d.fecha_limite > hasta) continue;
    const meDeben = d.tipo === 'ME_DEBEN';
    eventos.push({
      fecha: d.fecha_limite < hoy ? hoy : d.fecha_limite,
      titulo: meDeben ? `${d.persona} te debe pagar` : `Pagarle a ${d.persona}`,
      detalle: d.fecha_limite < hoy ? 'Deuda vencida' : 'Fecha límite de la deuda',
      monto: d.pendiente,
      moneda: d.unidad,
      sentido: meDeben ? 'entra' : 'sale',
      icono: 'handshake',
      ruta: `/deuda/${d.id}`,
    });
  }
  for (const m of datos.metas) {
    if (m.archivada || !m.fecha_objetivo || m.fecha_objetivo < hoy || m.fecha_objetivo > hasta) continue;
    eventos.push({
      fecha: m.fecha_objetivo,
      titulo: `Meta: ${m.nombre}`,
      detalle: `Llevas ${Math.round((m.saldo / m.monto_objetivo) * 100)} %`,
      monto: Math.max(m.monto_objetivo - m.saldo, 0),
      moneda: m.moneda,
      sentido: 'meta',
      icono: 'flag-checkered',
      ruta: `/meta/${m.id}`,
    });
  }
  return eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Carga todo lo que viene en los próximos `dias` días. */
export async function cargarProximos(db: BaseDatos, dias: number): Promise<Evento[]> {
  const [recurrentes, compras, deudas, metas] = await Promise.all([
    listarRecurrentes(db),
    listarCompras(db),
    listarDeudas(db, { incluirCerradas: false }),
    listarMetas(db),
  ]);
  const hasta = new Date();
  hasta.setDate(hasta.getDate() + dias);
  return proximosEventos({ recurrentes, compras, deudas, metas }, claveHoy(), claveHoy(hasta));
}

export function colorSentido(sentido: Evento['sentido'], oscuro: boolean): string {
  if (sentido === 'entra') return oscuro ? '#4ADE80' : '#2E7D32';
  if (sentido === 'sale') return oscuro ? '#F87171' : '#C62828';
  return oscuro ? '#B5E61D' : '#4D7C0F';
}
