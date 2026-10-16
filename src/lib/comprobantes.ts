import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

/*
 * Fotos de comprobantes (capturas de Pago Móvil, facturas). Se copian a la
 * carpeta de la app para que no se pierdan si se borran de la galería.
 */

function carpeta(): Directory {
  const d = new Directory(Paths.document, 'comprobantes');
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

/** Abre la cámara o la galería y devuelve la ruta de la copia guardada (null si se canceló). */
export async function elegirComprobante(origen: 'camara' | 'galeria'): Promise<string | null> {
  const permiso =
    origen === 'camara' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permiso.granted) throw new Error('La app no tiene permiso para usar la cámara o las fotos.');
  const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
  const r = origen === 'camara' ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
  if (r.canceled || !r.assets[0]) return null;
  const original = new File(r.assets[0].uri);
  const copia = new File(carpeta(), `comprobante-${Date.now()}.jpg`);
  original.copy(copia);
  return copia.uri;
}

/** Borra la copia de un comprobante que ya no se usa. */
export function borrarComprobante(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Si no existe o no se puede borrar, no pasa nada.
  }
}
