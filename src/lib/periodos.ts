// Periodos de los gráficos de Inicio: por día, por semana (lunes a domingo) o por mes.

export type Escala = 'dia' | 'semana' | 'mes';

export interface Periodo {
  /** Inicio (incluido), hora local. */
  desde: Date;
  /** Fin (excluido), hora local. */
  hasta: Date;
  /** Etiqueta corta para el eje, p. ej. "lun 22", "15/9", "sep". */
  corta: string;
  /** Etiqueta para el detalle, p. ej. "lun 22 sep", "Semana del 15 sep", "sep 2026". */
  larga: string;
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Los `n` periodos que terminan en el que contiene `fin`, del más viejo al más nuevo. */
export function periodos(escala: Escala, fin: Date, n: number): Periodo[] {
  const lista: Periodo[] = [];
  for (let i = n - 1; i >= 0; i--) {
    let desde: Date;
    let hasta: Date;
    if (escala === 'dia') {
      desde = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() - i);
      hasta = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + 1);
      lista.push({
        desde,
        hasta,
        corta: `${DIAS[desde.getDay()]} ${desde.getDate()}`,
        larga: `${DIAS[desde.getDay()]} ${desde.getDate()} ${MESES[desde.getMonth()]}`,
      });
    } else if (escala === 'semana') {
      const lunes = fin.getDate() - ((fin.getDay() + 6) % 7);
      desde = new Date(fin.getFullYear(), fin.getMonth(), lunes - 7 * i);
      hasta = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + 7);
      lista.push({
        desde,
        hasta,
        corta: `${desde.getDate()}/${desde.getMonth() + 1}`,
        larga: `Semana del ${desde.getDate()} ${MESES[desde.getMonth()]}`,
      });
    } else {
      desde = new Date(fin.getFullYear(), fin.getMonth() - i, 1);
      hasta = new Date(desde.getFullYear(), desde.getMonth() + 1, 1);
      lista.push({ desde, hasta, corta: MESES[desde.getMonth()], larga: `${MESES[desde.getMonth()]} ${desde.getFullYear()}` });
    }
  }
  return lista;
}
