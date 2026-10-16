import { ErrorValidacion } from './billeteras';
import { crearDeuda } from './deudas';
import { crearMovimiento, type DatosMovimiento } from './movimientos';
import type { BaseDatos } from './tipos';

/*
 * Dividir un gasto: pagas el total desde una billetera; tu parte queda como
 * gasto de la categoría y la de cada persona como un préstamo (te debe), que
 * también sale de esa billetera. Así el saldo baja por el total y cada uno
 * aparece en Deudas y préstamos.
 */

export interface ParteDivision {
  persona: string;
  /** Céntimos en la moneda de la billetera. */
  monto: number;
}

/** Partes iguales entre `personas` más tú; el redondeo lo absorbe tu parte. */
export function partesIguales(total: number, personas: number): { tuya: number; cadaUno: number } {
  const cadaUno = Math.floor(total / (personas + 1));
  return { tuya: total - cadaUno * personas, cadaUno };
}

export async function dividirGasto(
  db: BaseDatos,
  gasto: DatosMovimiento,
  partes: ParteDivision[],
  /** Bs. por dólar para llevar en dólares lo que te deben si se pagó en bolívares. */
  tasaReferencia: number | null,
): Promise<{ gasto: number; deudas: number[] }> {
  if (gasto.tipo !== 'GASTO') throw new ErrorValidacion('Solo se dividen gastos.');
  const validas = partes.map((p) => ({ ...p, persona: p.persona.trim() })).filter((p) => p.persona || p.monto);
  if (validas.length === 0) throw new ErrorValidacion('Agrega al menos una persona.');
  if (validas.some((p) => !p.persona)) throw new ErrorValidacion('Escribe el nombre de cada persona.');
  if (validas.some((p) => !Number.isSafeInteger(p.monto) || p.monto <= 0)) throw new ErrorValidacion('Cada parte debe ser mayor que cero.');
  const deOtros = validas.reduce((s, p) => s + p.monto, 0);
  if (deOtros >= gasto.monto) throw new ErrorValidacion('Las partes de los demás suman más que el total.');

  const billetera = await db.getFirstAsync<{ moneda: 'USD' | 'BS' | 'USDT' | 'EUR' }>(`SELECT moneda FROM billeteras WHERE id = ?`, [
    gasto.billetera_origen_id,
  ]);
  if (!billetera) throw new ErrorValidacion('Elige una billetera.');

  const id = await crearMovimiento(db, { ...gasto, monto: gasto.monto - deOtros });
  const deudas: number[] = [];
  for (const p of validas) {
    deudas.push(
      await crearDeuda(db, {
        tipo: 'ME_DEBEN',
        persona: p.persona,
        moneda: billetera.moneda,
        monto: p.monto,
        tasa_referencia: billetera.moneda === 'BS' ? tasaReferencia : null,
        fecha: gasto.fecha,
        nota: gasto.nota?.trim() ? `Su parte de: ${gasto.nota.trim()}` : 'Su parte de un gasto dividido',
        billetera_id: gasto.billetera_origen_id,
      }),
    );
  }
  return { gasto: id, deudas };
}
