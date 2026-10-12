/** Secciones de Inicio que se pueden reordenar u ocultar (el balance va siempre arriba). */
export type ClaveSeccion =
  | 'accesos'
  | 'billeteras'
  | 'rapidos'
  | 'mes'
  | 'pronostico'
  | 'analisis'
  | 'presupuestos'
  | 'categorias'
  | 'columnas'
  | 'evolucion'
  | 'recientes';

export interface Seccion {
  clave: ClaveSeccion;
  visible: boolean;
}

export const NOMBRE_SECCION: Record<ClaveSeccion, { nombre: string; icono: string }> = {
  accesos: { nombre: 'Botones rápidos (Gasto, Ingreso…)', icono: 'gesture-tap-button' },
  billeteras: { nombre: 'Mis billeteras', icono: 'wallet' },
  rapidos: { nombre: 'Movimientos rápidos', icono: 'lightning-bolt' },
  mes: { nombre: 'Ingresos y egresos del mes', icono: 'calendar-month' },
  pronostico: { nombre: 'Pronóstico del mes', icono: 'crystal-ball' },
  analisis: { nombre: 'Fijos, variables y gastos hormiga', icono: 'magnify-scan' },
  presupuestos: { nombre: 'Presupuestos del mes', icono: 'chart-donut' },
  categorias: { nombre: 'Gastos por categoría', icono: 'chart-pie' },
  columnas: { nombre: 'Ingresos vs. gastos', icono: 'chart-bar' },
  evolucion: { nombre: 'Evolución de lo disponible', icono: 'chart-line' },
  recientes: { nombre: 'Movimientos recientes', icono: 'history' },
};

export const SECCIONES_INICIO: Seccion[] = (Object.keys(NOMBRE_SECCION) as ClaveSeccion[]).map((clave) => ({ clave, visible: true }));

export const CLAVE_SECCIONES = 'inicio_secciones';

/** Lee la preferencia guardada; las secciones nuevas o desconocidas se completan con las de siempre. */
export function leerSecciones(guardado: string | null): Seccion[] {
  try {
    const lista = guardado ? (JSON.parse(guardado) as Seccion[]) : [];
    const validas = lista.filter((s) => s && s.clave in NOMBRE_SECCION && typeof s.visible === 'boolean');
    const faltan = SECCIONES_INICIO.filter((s) => !validas.some((v) => v.clave === s.clave));
    return [...validas, ...faltan];
  } catch {
    return SECCIONES_INICIO;
  }
}
