import { normalizar } from './dictado';
import { parsearMonto, type Moneda } from './moneda';

/*
 * Convierte un aviso del banco ("Pago Móvil recibido por Bs. 1.500,00",
 * "Realizaste un pago de Bs 350,00") en un movimiento propuesto.
 */

export interface MovimientoPropuesto {
  tipo: 'GASTO' | 'INGRESO';
  monto: number;
  moneda: Moneda;
  billeteraId: number | null;
  nota: string;
}

const INGRESO = /(recibi|recibiste|recibido|te (pago|pagaron|envio|enviaron|transfirio|transfirieron)|abono|credito|acreditado|deposito)/;
const MONEDA_MONTO = /(bs\.?\s*s?|usdt|usd|\$|€|eur)\s*([\d.,]*\d)|([\d.,]*\d)\s*(bs\.?|usdt|usd|\$|€)/;

function monedaDe(simbolo: string): Moneda {
  const s = simbolo.replace(/[\s.]/g, '');
  if (s.startsWith('bs')) return 'BS';
  if (s === 'usdt') return 'USDT';
  if (s === '€' || s === 'eur') return 'EUR';
  return 'USD';
}

export function interpretarAviso(
  aviso: { app: string; titulo: string; texto: string },
  billeteras: { id: number; nombre: string; moneda: Moneda }[],
): MovimientoPropuesto | null {
  const t = normalizar(`${aviso.titulo} ${aviso.texto}`);
  const m = t.match(MONEDA_MONTO);
  if (!m) return null;
  const simbolo = m[1] ?? m[4];
  const monto = parsearMonto(m[2] ?? m[3]);
  if (!monto || monto <= 0) return null;
  const moneda = monedaDe(simbolo);
  const tipo = INGRESO.test(t) ? 'INGRESO' : 'GASTO';
  // Billetera: la que se llame como la app o se nombre en el aviso; si no, la primera en esa moneda.
  const app = normalizar(aviso.app);
  const porNombre = billeteras.find((b) => {
    const n = normalizar(b.nombre);
    return b.moneda === moneda && (app.includes(n) || n.includes(app) || t.includes(n) || n.split(/[\s/]+/).some((p) => p.length > 3 && app.includes(p)));
  });
  const billetera = porNombre ?? billeteras.find((b) => b.moneda === moneda);
  return { tipo, monto, moneda, billeteraId: billetera?.id ?? null, nota: `${aviso.app}: ${aviso.texto || aviso.titulo}`.slice(0, 120) };
}
