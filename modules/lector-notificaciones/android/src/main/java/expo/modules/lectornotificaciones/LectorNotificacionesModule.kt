package expo.modules.lectornotificaciones

import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LectorNotificacionesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LectorNotificaciones")

    /** Si el usuario le dio a la app acceso a las notificaciones. */
    Function("tienePermiso") {
      val ctx = appContext.reactContext
      val activos = if (ctx == null) null else Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners")
      ctx != null && activos != null && activos.contains(ctx.packageName)
    }

    /** Abre la pantalla de Android donde se da el acceso a las notificaciones. */
    Function("abrirAjustes") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        ctx.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    /** Avisos guardados, en JSON (el más nuevo primero). */
    Function("leer") {
      Almacen.leer(appContext.reactContext)
    }

    Function("borrar") { id: String ->
      Almacen.borrar(appContext.reactContext, id)
    }
  }
}
