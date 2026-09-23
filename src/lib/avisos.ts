import { guardarPreferencia, leerPreferencia } from '../db/preferencias';
import { listarRecurrentes } from '../db/recurrentes';
import { tasaAnterior, type Tasas } from '../db/tasas';
import type { BaseDatos } from '../db/tipos';
import { evaluarAlertas, type ConfigAlertas } from './alertas';
import { claveDia } from './fechas';
import { formatearMonto } from './moneda';
import { notificarAhora, programarAvisosRecurrentes } from './notificaciones';

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
