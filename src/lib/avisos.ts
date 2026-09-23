import { listarRecurrentes } from '../db/recurrentes';
import type { BaseDatos } from '../db/tipos';
import { formatearMonto } from './moneda';
import { programarAvisosRecurrentes } from './notificaciones';

/** Reprograma los avisos de los recurrentes manuales activos (tras cualquier cambio o al abrir la app). */
export async function actualizarAvisosRecurrentes(db: BaseDatos): Promise<void> {
  const recurrentes = await listarRecurrentes(db);
  await programarAvisosRecurrentes(
    recurrentes
      .filter((r) => r.activo && !r.automatico)
      .map((r) => ({
        id: r.id,
        nombre: r.nombre,
        detalle: `${r.tipo === 'GASTO' ? 'Pagar' : 'Cobrar'} ${formatearMonto(r.monto, r.billetera_moneda)}`,
        fecha: r.proxima_fecha,
      })),
  );
}
