package expo.modules.lectornotificaciones

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/** Recibe las notificaciones del teléfono y guarda solo las que parecen pagos o cobros. */
class ServicioNotificaciones : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null || sbn.packageName == packageName) return
    val extras = sbn.notification?.extras ?: return
    val titulo = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
    val texto = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
    if (!Almacen.pareceMovimiento("$titulo $texto")) return
    val app = try {
      packageManager.getApplicationLabel(packageManager.getApplicationInfo(sbn.packageName, 0)).toString()
    } catch (e: Exception) {
      sbn.packageName
    }
    Almacen.guardar(this, app, sbn.packageName, titulo, texto, sbn.postTime)
  }
}
