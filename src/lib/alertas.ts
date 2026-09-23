import { brecha } from './conversion';
import { formatearTasa } from './tasa';

/*
 * Alertas de tasa: se evalúan cada vez que llegan tasas nuevas (con la app
 * abierta o al volver a ella) y como mucho una vez por día.
 */

export interface ConfigAlertas {
  /** Avisar si el paralelo sube este % o más respecto al día anterior (null = desactivado). */
  subidaParalelo: number | null;
  /** Avisar si la brecha paralelo/BCV llega a este % (null = desactivado). */
  brechaMaxima: number | null;
}

export function evaluarAlertas(
  hoy: { bcv?: number; paralelo?: number },
  paraleloAnterior: number | null,
  config: ConfigAlertas,
): string[] {
  const mensajes: string[] = [];
  const { bcv, paralelo } = hoy;
  if (config.subidaParalelo !== null && paralelo && paraleloAnterior) {
    const subida = (paralelo / paraleloAnterior - 1) * 100;
    if (subida >= config.subidaParalelo) {
      mensajes.push(
        `El paralelo subió ${subida.toFixed(1).replace('.', ',')} %: de ${formatearTasa(paraleloAnterior)} a ${formatearTasa(paralelo)} Bs./USD.`,
      );
    }
  }
  if (config.brechaMaxima !== null && bcv && paralelo) {
    const b = brecha(bcv, paralelo);
    if (b >= config.brechaMaxima) {
      mensajes.push(`La brecha entre paralelo y BCV llegó a ${b.toFixed(1).replace('.', ',')} %.`);
    }
  }
  return mensajes;
}
