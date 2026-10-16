// Las fechas se guardan en ISO UTC; todo lo que se muestra o agrupa usa la hora local del teléfono.

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function inicioDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Clave local "AAAA-MM-DD" para agrupar movimientos por día. */
export function claveDia(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "Hoy", "Ayer", "lun 15 sep" o "lun 15 sep 2025" si es de otro año. */
export function formatearDia(iso: string, hoy: Date = new Date()): string {
  const d = new Date(iso);
  const dias = Math.round((inicioDelDia(hoy).getTime() - inicioDelDia(d).getTime()) / 86_400_000);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  const base = `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
  return d.getFullYear() === hoy.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function formatearHora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatearFechaCorta(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export function nombreMes(d: Date): string {
  return `${MESES_LARGOS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Rango [desde, hasta) en ISO del mes local que contiene `d`, desplazado `delta` meses. */
export function rangoMes(d: Date, delta = 0): { desde: string; hasta: string } {
  const desde = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  const hasta = new Date(d.getFullYear(), d.getMonth() + delta + 1, 1);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

/** Rango [desde, hasta) en ISO que cubre los días locales completos entre ambas fechas. */
export function rangoDias(desde: Date, hasta: Date): { desde: string; hasta: string } {
  const fin = inicioDelDia(hasta);
  fin.setDate(fin.getDate() + 1);
  return { desde: inicioDelDia(desde).toISOString(), hasta: fin.toISOString() };
}

/** "hace un momento", "hace 5 min", "hace 3 h", o la fecha corta con hora si es de otro día. */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const minutos = Math.floor((ahora.getTime() - Date.parse(iso)) / 60_000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 24 * 60) return `hace ${Math.floor(minutos / 60)} h`;
  const d = new Date(iso);
  return `el ${formatearFechaCorta(d)} ${formatearHora(iso)}`;
}

/** Meses que quedan (contando el actual) hasta una fecha "AAAA-MM-DD"; mínimo 1. */
export function mesesHasta(fechaObjetivo: string, hoy: Date = new Date()): number {
  const [a, m, d] = fechaObjetivo.split('-').map(Number);
  const meses = (a - hoy.getFullYear()) * 12 + (m - 1) - hoy.getMonth();
  // Si el día objetivo ya pasó dentro de su mes, ese mes no cuenta completo.
  return Math.max(d >= hoy.getDate() ? meses : meses - 1, 0) + 1;
}

/** "AAAA-MM-DD" (fecha sin hora) a texto corto, p. ej. "15 ene 2027". */
export function fechaSimpleLegible(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return formatearFechaCorta(new Date(a, m - 1, d));
}
