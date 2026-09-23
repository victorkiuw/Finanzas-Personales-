package expo.modules.lectornotificaciones

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Guarda en un archivo de la app los avisos que parecen movimientos de dinero
 * (máximo 30), para que la app los proponga al abrirse.
 */
object Almacen {
  private const val ARCHIVO = "avisos_banco.json"
  private const val MAXIMO = 30

  private val monto = Regex("""(bs\.?|bs\.s|usd|\$|€|eur|usdt)\s*[\d.,]*\d|\d[\d.,]*\s*(bs\.?|usd|\$|€|usdt)""", RegexOption.IGNORE_CASE)
  private val palabras = Regex(
    "pago|pag[oó] m[oó]vil|pagomovil|transferencia|recibi|recibiste|abono|d[eé]bito|cr[eé]dito|compra|consumo|retiro|enviaste|te enviaron|dep[oó]sito",
    RegexOption.IGNORE_CASE,
  )

  fun pareceMovimiento(texto: String): Boolean = monto.containsMatchIn(texto) && palabras.containsMatchIn(texto)

  private fun archivo(ctx: Context) = File(ctx.filesDir, ARCHIVO)

  @Synchronized
  fun leer(ctx: Context?): String {
    if (ctx == null) return "[]"
    val f = archivo(ctx)
    return if (f.exists()) f.readText() else "[]"
  }

  @Synchronized
  fun guardar(ctx: Context, app: String, paquete: String, titulo: String, texto: String, fecha: Long) {
    val lista = try {
      JSONArray(leer(ctx))
    } catch (e: Exception) {
      JSONArray()
    }
    val id = "$paquete-$fecha"
    for (i in 0 until lista.length()) {
      val o = lista.optJSONObject(i) ?: continue
      // La misma notificación puede llegar varias veces (al actualizarse).
      if (o.optString("texto") == texto && o.optString("paquete") == paquete) return
    }
    val nuevo = JSONObject()
      .put("id", id)
      .put("app", app)
      .put("paquete", paquete)
      .put("titulo", titulo)
      .put("texto", texto)
      .put("fecha", fecha)
    val resultado = JSONArray().put(nuevo)
    for (i in 0 until minOf(lista.length(), MAXIMO - 1)) resultado.put(lista.get(i))
    archivo(ctx).writeText(resultado.toString())
  }

  @Synchronized
  fun borrar(ctx: Context?, id: String) {
    if (ctx == null) return
    val lista = try {
      JSONArray(leer(ctx))
    } catch (e: Exception) {
      JSONArray()
    }
    val resultado = JSONArray()
    for (i in 0 until lista.length()) {
      val o = lista.optJSONObject(i) ?: continue
      if (o.optString("id") != id) resultado.put(o)
    }
    archivo(ctx).writeText(resultado.toString())
  }
}
