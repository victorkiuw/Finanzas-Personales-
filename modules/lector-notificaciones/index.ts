import { requireOptionalNativeModule } from 'expo';

/** Aviso de una app (banco) que parece un movimiento de dinero. */
export interface AvisoBanco {
  id: string;
  /** Nombre de la app que lo mostró, p. ej. "Mercantil". */
  app: string;
  paquete: string;
  titulo: string;
  texto: string;
  /** Milisegundos desde 1970. */
  fecha: number;
}

interface Nativo {
  tienePermiso(): boolean;
  abrirAjustes(): void;
  leer(): string;
  borrar(id: string): void;
}

// Solo existe en Android con la app compilada (no en Expo Go ni en pruebas).
const nativo = requireOptionalNativeModule<Nativo>('LectorNotificaciones');

export const lectorDisponible = nativo !== null;

export function tienePermiso(): boolean {
  return nativo?.tienePermiso() ?? false;
}

export function abrirAjustesNotificaciones(): void {
  nativo?.abrirAjustes();
}

export function leerAvisos(): AvisoBanco[] {
  try {
    return JSON.parse(nativo?.leer() ?? '[]') as AvisoBanco[];
  } catch {
    return [];
  }
}

export function borrarAviso(id: string): void {
  nativo?.borrar(id);
}
