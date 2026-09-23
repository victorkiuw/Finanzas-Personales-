import { guardarPreferencia, leerPreferencia } from '../db/preferencias';
import { listarCompras } from '../db/cuotas';
import { listarDeudas } from '../db/deudas';
import { listarRecurrentes } from '../db/recurrentes';
import { Conversor, filasDeReporte, resumirPeriodo } from '../db/reportes';
import { cambioDe, listarHistorial, obtenerTasas, tasaAnterior, type Tasas } from '../db/tasas';
import type { BaseDatos } from '../db/tipos';
import { evaluarAlertas, type ConfigAlertas } from './alertas';
import { claveDia, nombreMes, rangoMes } from './fechas';
import { formatearMonto } from './moneda';
import { notificarAhora, programarAvisos, programarAvisosRecurrentes } from './notificaciones';

/** Reprograma los avisos de los recurrentes manuales activos (tras cualquier cambio o al abrir la app). */
export async function actualizarAvisosRecurrentes(db: BaseDatos): Promise<void> {
  const recurrentes = await listarRecurrentes(db);
  await programarAvisosRecurrentes(
    recurrentes
      .filter((r) => r.activo && !r.automatico)
      .map((r) => ({
        id: r.id,
        nombre: r.nombre,
        detalle: `${r.tipo === 'GASTO' ? 'Pagar' : 'Cobrar'} ${formatearMonto(r.monto, r.billetera_moneda)}`,
        fecha: r.proxima_fecha,
      })),
  );
}

export const CLAVE_ALERTA_SUBIDA = 'alerta_subida_paralelo';
export const CLAVE_ALERTA_BRECHA = 'alerta_brecha';
const CLAVE_ALERTA_DIA = 'alerta_ultimo_dia';

export async function leerConfigAlertas(db: BaseDatos): Promise<ConfigAlertas> {
  const [s, b] = await Promise.all([leerPreferencia(db, CLAVE_ALERTA_SUBIDA), leerPreferencia(db, CLAVE_ALERTA_BRECHA)]);
  return { subidaParalelo: s ? Number(s) : null, brechaMaxima: b ? Number(b) : null };
}

/** Tras actualizar tasas: si se cumple alguna alerta configurada, notifica (una vez por día). */
export async function revisarAlertasTasa(db: BaseDatos, tasas: Tasas): Promise<void> {
  const config = await leerConfigAlertas(db);
  if (config.subidaParalelo === null && config.brechaMaxima === null) return;
  const hoy = claveDia(new Date().toISOString());
  if ((await leerPreferencia(db, CLAVE_ALERTA_DIA)) === hoy) return;
  const anterior = await tasaAnterior(db, 'PARALELO', hoy);
  const mensajes = evaluarAlertas({ bcv: tasas.BCV?.tasa, paralelo: tasas.PARALELO?.tasa }, anterior, config);
  if (mensajes.length === 0) return;
  await notificarAhora('Alerta de tasa', mensajes.join(' '));
  await guardarPreferencia(db, CLAVE_ALERTA_DIA, hoy);
}

/** 9:00 del día indicado ("AAAA-MM-DD") desplazado `dias`. */
function nueveDe(dia: string, dias = 0): Date {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d + dias, 9);
}

/**
 * Avisos de lo que vence: cada cuota de Cashea un día antes, y cada deuda con
 * fecha límite un día antes y el mismo día.
 */
export async function actualizarAvisosVencimientos(db: BaseDatos): Promise<void> {
  const [compras, deudas] = await Promise.all([listarCompras(db), listarDeudas(db, { incluirCerradas: false })]);
  const cuotas = compras.flatMap((c) =>
    c.calendario
      .filter((q) => !q.pagada)
      .map((q) => ({
        id: `${c.id}-${q.numero}`,
        titulo: `Mañana vence tu cuota de ${c.comercio}`,
        cuerpo: `Cuota ${q.numero} de ${c.cuotas}: ${formatearMonto(q.monto, 'USD')}.`,
        cuando: nueveDe(q.fecha, -1),
      })),
  );
  await programarAvisos('cuota-', cuotas);
  const conFecha = deudas.filter((d) => d.fecha_limite && d.pendiente > 0);
  await programarAvisos(
    'deuda-',
    conFecha.flatMap((d) => {
      const meDeben = d.tipo === 'ME_DEBEN';
      const que = meDeben ? `${d.persona} te debe ${formatearMonto(d.pendiente, d.unidad)}` : `Le debes ${formatearMonto(d.pendiente, d.unidad)} a ${d.persona}`;
      return [
        { id: `${d.id}-antes`, titulo: meDeben ? 'Mañana toca cobrar' : 'Mañana toca pagar', cuerpo: `${que}.`, cuando: nueveDe(d.fecha_limite!, -1) },
        { id: `${d.id}-dia`, titulo: meDeben ? 'Hoy toca cobrar' : 'Hoy toca pagar', cuerpo: `${que}. Toca para enviarle un recordatorio.`, cuando: nueveDe(d.fecha_limite!) },
      ];
    }),
  );
}

const CLAVE_RESUMEN = 'resumen_mensual_enviado';

/**
 * Al abrir la app en un mes nuevo: notifica una vez el resumen del mes que
 * terminó (ingresos, gastos, en qué se gastó más y la comparación con el anterior).
 */
export async function enviarResumenMensual(db: BaseDatos, hoy = new Date()): Promise<void> {
  const anterior = rangoMes(hoy, -1);
  const clave = anterior.desde.slice(0, 7);
  if ((await leerPreferencia(db, CLAVE_RESUMEN)) === clave) return;
  const tasas = await obtenerTasas(db);
  const referencia = (await leerPreferencia(db, 'tasa_referencia')) === 'BCV' ? 'BCV' : 'PARALELO';
  const cambio = cambioDe(tasas, referencia);
  const conversor = new Conversor(await listarHistorial(db, referencia), cambio.dolar, null, cambio.euro);
  const [filas, filasPrevias] = await Promise.all([
    filasDeReporte(db, anterior.desde, anterior.hasta),
    filasDeReporte(db, rangoMes(hoy, -2).desde, rangoMes(hoy, -2).hasta),
  ]);
  await guardarPreferencia(db, CLAVE_RESUMEN, clave);
  if (filas.length === 0) return;
  const r = resumirPeriodo(filas, conversor, 'USD');
  const previo = resumirPeriodo(filasPrevias, conversor, 'USD');
  const top = r.gastosPorCategoria[0];
  const partes = [
    `Ingresos ${formatearMonto(r.ingresos, 'USD')}, gastos ${formatearMonto(r.gastos, 'USD')}.`,
    top ? `Donde más gastaste: ${top.nombre} (${formatearMonto(top.total, 'USD')}).` : '',
    previo.gastos > 0
      ? `Gastaste ${Math.abs(Math.round((r.gastos / previo.gastos - 1) * 100))} % ${r.gastos >= previo.gastos ? 'más' : 'menos'} que el mes anterior.`
      : '',
  ];
  const [a, m] = clave.split('-').map(Number);
  await notificarAhora(`Tu resumen de ${nombreMes(new Date(a, m - 1, 1))}`, partes.filter(Boolean).join(' '));
}
