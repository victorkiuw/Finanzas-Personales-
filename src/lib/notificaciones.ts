import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/*
 * Notificaciones locales (no hace falta internet ni servidor): recordatorio
 * diario, avisos de recurrentes por confirmar y alertas de tasa.
 */

const CANAL = 'recordatorios';
const ID_DIARIO = 'recordatorio-diario';
const PREFIJO_RECURRENTE = 'recurrente-';

let configurado = false;

export async function configurarNotificaciones(): Promise<void> {
  if (configurado) return;
  configurado = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Recordatorios',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

/** Pide permiso si hace falta. Devuelve si se pueden mostrar notificaciones. */
export async function pedirPermiso(): Promise<boolean> {
  const actual = await Notifications.getPermissionsAsync();
  if (actual.granted) return true;
  if (!actual.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function programarRecordatorioDiario(hora: number, minuto: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(ID_DIARIO).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: ID_DIARIO,
    content: { title: '¿Anotaste tus gastos de hoy?', body: 'Toma 10 segundos y mantiene tus cuentas al día.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: hora, minute: minuto, channelId: CANAL },
  });
}

export async function cancelarRecordatorioDiario(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(ID_DIARIO).catch(() => {});
}

/** Reprograma un aviso a las 9:00 del día de cada recurrente pendiente de confirmar. */
export async function programarAvisosRecurrentes(
  avisos: { id: number; nombre: string; detalle: string; fecha: string }[],
): Promise<void> {
  const programadas = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    programadas
      .filter((n) => n.identifier.startsWith(PREFIJO_RECURRENTE))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  const ahora = Date.now();
  for (const a of avisos) {
    const [y, m, d] = a.fecha.split('-').map(Number);
    const cuando = new Date(y, m - 1, d, 9);
    if (cuando.getTime() <= ahora) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `${PREFIJO_RECURRENTE}${a.id}`,
      content: { title: `Hoy toca: ${a.nombre}`, body: `${a.detalle}. Ábrela para confirmarlo.` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: cuando, channelId: CANAL },
    });
  }
}

export async function notificarAhora(titulo: string, cuerpo: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({ content: { title: titulo, body: cuerpo }, trigger: null });
}
