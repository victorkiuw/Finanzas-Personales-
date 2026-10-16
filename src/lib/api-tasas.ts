// Cliente de ve.dolarapi.com. Respuesta de /v1/dolares (se verificó con el código de la API):
// [{ "moneda": "USD", "fuente": "oficial", "promedio": 852.41, "fechaActualizacion": "2026-09-22T00:00:00-04:00", ... },
//  { "moneda": "USD", "fuente": "paralelo", "promedio": 952.36, "fechaActualizacion": "2026-09-22T20:01:15.941Z", ... }]
// /v1/euros responde igual con "moneda": "EUR" (de ahí se toma solo el oficial del BCV).

export const URL_TASAS = 'https://ve.dolarapi.com/v1/dolares';
export const URL_EUROS = 'https://ve.dolarapi.com/v1/euros';
export const TIEMPO_ESPERA_MS = 10_000;

/**
 * BCV = dólar oficial; PARALELO = dólar paralelo, que la app muestra como "USDT"
 * (tasa de mercado); EURO = euro oficial del BCV.
 */
export type Par = 'BCV' | 'PARALELO' | 'EURO';

/** Tasas del dólar que se pueden elegir como referencia para convertir. */
export type ParDolar = 'BCV' | 'PARALELO';

export const PARES: readonly ParDolar[] = ['BCV', 'PARALELO'];

/** Todas las tasas que se consultan y guardan. */
export const TODOS_LOS_PARES: readonly Par[] = ['BCV', 'PARALELO', 'EURO'];

export const NOMBRE_PAR: Record<Par, string> = { BCV: 'BCV', PARALELO: 'USDT', EURO: 'Euro BCV' };

export interface TasaConsultada {
  /** Bolívares por dólar. */
  tasa: number;
  /** Fecha de la cotización según la fuente (ISO). */
  fecha: string;
}

/** Par según moneda y fuente de la API; el euro paralelo no se usa. */
function parDe(moneda: unknown, fuente: unknown): Par | undefined {
  if (typeof fuente !== 'string') return undefined;
  const f = fuente.toLowerCase();
  if (moneda === 'EUR') return f === 'oficial' ? 'EURO' : undefined;
  if (moneda !== undefined && moneda !== 'USD') return undefined;
  return f === 'oficial' ? 'BCV' : f === 'paralelo' ? 'PARALELO' : undefined;
}

export class ErrorTasas extends Error {}

/** Extrae las tasas de la respuesta; ignora entradas desconocidas o sin un número válido. */
export function parsearRespuesta(json: unknown): Partial<Record<Par, TasaConsultada>> {
  if (!Array.isArray(json)) throw new ErrorTasas('Respuesta inesperada del servidor de tasas.');
  const tasas: Partial<Record<Par, TasaConsultada>> = {};
  for (const item of json) {
    if (!item || typeof item !== 'object') continue;
    const { moneda, fuente, promedio, venta, compra, fechaActualizacion } = item as Record<string, unknown>;
    const par = parDe(moneda, fuente);
    if (!par) continue;
    const tasa = [promedio, venta, compra].find((v): v is number => typeof v === 'number' && v > 0);
    if (!tasa) continue;
    const fecha =
      typeof fechaActualizacion === 'string' && !Number.isNaN(Date.parse(fechaActualizacion))
        ? new Date(fechaActualizacion).toISOString()
        : new Date().toISOString();
    tasas[par] = { tasa, fecha };
  }
  if (Object.keys(tasas).length === 0) throw new ErrorTasas('La respuesta no trae tasas válidas.');
  return tasas;
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** GET con tiempo de espera; convierte los fallos de red en ErrorTasas legibles. */
async function obtenerJson(url: string, fetchFn: Fetch, tiempoEspera: number): Promise<unknown> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), tiempoEspera);
  try {
    const respuesta = await fetchFn(url, { signal: control.signal });
    if (!respuesta.ok) throw new ErrorTasas(`El servidor de tasas respondió ${respuesta.status}.`);
    return await respuesta.json();
  } catch (e) {
    if (e instanceof ErrorTasas) throw e;
    throw new ErrorTasas(control.signal.aborted ? 'Se agotó el tiempo de espera.' : 'Sin conexión.');
  } finally {
    clearTimeout(temporizador);
  }
}

/** Dólares y euro. Si solo falla el euro, se devuelven los dólares igual. */
export async function consultarTasas(
  fetchFn: Fetch = fetch,
  tiempoEspera = TIEMPO_ESPERA_MS,
): Promise<Partial<Record<Par, TasaConsultada>>> {
  const [dolares, euros] = await Promise.all([
    obtenerJson(URL_TASAS, fetchFn, tiempoEspera).then(parsearRespuesta),
    obtenerJson(URL_EUROS, fetchFn, tiempoEspera)
      .then(parsearRespuesta)
      .catch(() => ({})),
  ]);
  return { ...dolares, ...euros };
}

export const URL_HISTORICO = 'https://ve.dolarapi.com/v1/historicos/dolares';
export const URL_HISTORICO_EURO = 'https://ve.dolarapi.com/v1/historicos/euros/oficial';

export interface TasaDiaria {
  par: Par;
  /** "AAAA-MM-DD". */
  dia: string;
  tasa: number;
}

/**
 * Respuesta de /v1/historicos/dolares: una entrada por fuente y día desde 2023,
 * p. ej. { "fuente": "oficial", "promedio": 849.564, "fecha": "2026-09-21" }.
 */
export function parsearHistorico(json: unknown): TasaDiaria[] {
  if (!Array.isArray(json)) throw new ErrorTasas('Respuesta inesperada del histórico de tasas.');
  const tasas: TasaDiaria[] = [];
  for (const item of json) {
    if (!item || typeof item !== 'object') continue;
    const { moneda, fuente, promedio, venta, compra, fecha } = item as Record<string, unknown>;
    const par = parDe(moneda, fuente);
    const tasa = [promedio, venta, compra].find((v): v is number => typeof v === 'number' && v > 0);
    if (!par || !tasa || typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    tasas.push({ par, dia: fecha, tasa });
  }
  return tasas;
}

/** Histórico del dólar y del euro oficial; si solo falla el del euro, se devuelve el del dólar. */
export async function consultarHistorico(fetchFn: Fetch = fetch, tiempoEspera = 20_000): Promise<TasaDiaria[]> {
  const [dolares, euros] = await Promise.all([
    obtenerJson(URL_HISTORICO, fetchFn, tiempoEspera).then(parsearHistorico),
    obtenerJson(URL_HISTORICO_EURO, fetchFn, tiempoEspera)
      .then(parsearHistorico)
      .catch(() => []),
  ]);
  return [...dolares, ...euros];
}
