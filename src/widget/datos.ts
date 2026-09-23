import { listarBilleteras } from '../db/billeteras';
import { listarMetas } from '../db/metas';
import { leerPreferencia } from '../db/preferencias';
import { obtenerTasas } from '../db/tasas';
import type { BaseDatos } from '../db/tipos';
import { NOMBRE_PAR, type Par } from '../lib/api-tasas';
import { totalConsolidado } from '../lib/conversion';
import { formatearHora } from '../lib/fechas';
import { esMoneda, formatearMonto, type Moneda } from '../lib/moneda';
import { formatearTasa } from '../lib/tasa';

export interface DatosWidget {
  patrimonio: string;
  referencia: string;
  bcv: string;
  paralelo: string;
  actualizado: string;
}

/** Lo que muestra el widget, calculado igual que el patrimonio de la app. */
export async function datosWidget(db: BaseDatos): Promise<DatosWidget> {
  const [billeteras, metas, tasas, ref, base] = await Promise.all([
    listarBilleteras(db),
    listarMetas(db),
    obtenerTasas(db),
    leerPreferencia(db, 'tasa_referencia'),
    leerPreferencia(db, 'moneda_base'),
  ]);
  const referencia: Par = ref === 'BCV' ? 'BCV' : 'PARALELO';
  const moneda: Moneda = esMoneda(base) ? base : 'USD';
  const tasa = tasas[referencia]?.tasa;
  const saldos = [...billeteras, ...metas.filter((m) => m.saldo !== 0)];
  const necesitaTasa = moneda === 'BS' || saldos.some((s) => s.moneda === 'BS' && s.saldo !== 0);
  const patrimonio = !necesitaTasa || tasa ? `≈ ${formatearMonto(totalConsolidado(saldos, moneda, tasa ?? 1), moneda)}` : '—';
  return {
    patrimonio,
    referencia: NOMBRE_PAR[referencia],
    bcv: tasas.BCV ? formatearTasa(tasas.BCV.tasa) : '—',
    paralelo: tasas.PARALELO ? formatearTasa(tasas.PARALELO.tasa) : '—',
    actualizado: tasas.PARALELO?.consultada_en ? formatearHora(tasas.PARALELO.consultada_en) : '',
  };
}
