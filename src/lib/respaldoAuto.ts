import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { copiasSobrantes } from '../db/exportar';
import { guardarPreferencia, leerPreferencia } from '../db/preferencias';
import { exportarDatos, importarDatos, validarRespaldo } from '../db/respaldo';
import type { BaseDatos } from '../db/tipos';
import { claveDia } from './fechas';

/*
 * Copias automáticas: una por día al abrir la app, dentro del almacenamiento
 * de la app (se conservan 7). Protegen contra errores o borrados, pero NO si
 * se pierde el teléfono: para eso está exportar la copia fuera (Drive, etc.),
 * que se recuerda cada 7 días.
 */

const CLAVE_ULTIMA_AUTO = 'copia_auto_dia';
export const CLAVE_ULTIMA_EXPORTACION = 'ultima_exportacion';
export const DIAS_AVISO_EXPORTAR = 7;

function carpeta(): Directory {
  const d = new Directory(Paths.document, 'respaldos');
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

export async function hacerCopiaAutomatica(db: BaseDatos, ahora = new Date()): Promise<void> {
  const hoy = claveDia(ahora.toISOString());
  if ((await leerPreferencia(db, CLAVE_ULTIMA_AUTO)) === hoy) return;
  const dir = carpeta();
  const archivo = new File(dir, `auto-${hoy}.json`);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(JSON.stringify(await exportarDatos(db, ahora)));
  const nombres = dir.list().filter((x): x is File => x instanceof File).map((f) => f.name);
  for (const n of copiasSobrantes(nombres)) new File(dir, n).delete();
  await guardarPreferencia(db, CLAVE_ULTIMA_AUTO, hoy);
}

export function listarCopiasAutomaticas(): { nombre: string; dia: string; archivo: File }[] {
  return carpeta()
    .list()
    .filter((x): x is File => x instanceof File && /^auto-\d{4}-\d{2}-\d{2}\.json$/.test(x.name))
    .map((f) => ({ nombre: f.name, dia: f.name.slice(5, 15), archivo: f }))
    .sort((a, b) => b.dia.localeCompare(a.dia));
}

export async function restaurarCopiaAutomatica(db: BaseDatos, archivo: File): Promise<void> {
  await importarDatos(db, validarRespaldo(JSON.parse(await archivo.text())));
}

/** Escribe un archivo temporal y abre la hoja de compartir de Android. */
export async function compartirArchivo(nombre: string, contenido: string, mimeType: string, titulo: string): Promise<void> {
  const archivo = new File(Paths.cache, nombre);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(contenido);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este teléfono no permite compartir archivos.');
  await Sharing.shareAsync(archivo.uri, { mimeType, dialogTitle: titulo });
}

/** Días desde la última exportación manual (null si nunca se exportó). */
export async function diasSinExportar(db: BaseDatos, ahora = new Date()): Promise<number | null> {
  const ultima = await leerPreferencia(db, CLAVE_ULTIMA_EXPORTACION);
  if (!ultima) return null;
  return Math.floor((ahora.getTime() - Date.parse(ultima)) / 86_400_000);
}
