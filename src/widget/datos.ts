import { listarBilleteras } from '../db/billeteras';
import { leerPreferencia } from '../db/preferencias';
import { cambioDe, obtenerTasas } from '../db/tasas';
import type { BaseDatos } from '../db/tipos';
import { NOMBRE_PAR, type ParDolar } from '../lib/api-tasas';
import { totalConsolidado } from '../lib/conversion';
import { formatearHora } from '../lib/fechas';
import { esMoneda, formatearMonto, type Moneda } from '../lib/moneda';
import { formatearTasa } from '../lib/tasa';

export interface DatosWidget {
  patrimonio: string;
  referencia: string;
  bcv: string;
  paralelo: string;
  euro: string;
  actualizado: string;
}

/** Lo que muestra el widget, calculado igual que el disponible de la app (sin metas ni billeteras aparte). */
export async function datosWidget(db: BaseDatos): Promise<DatosWidget> {
  const [billeteras, tasas, ref, base] = await Promise.all([
    listarBilleteras(db),
    obtenerTasas(db),
    leerPreferencia(db, 'tasa_referencia'),
    leerPreferencia(db, 'moneda_base'),
  ]);
  const referencia: ParDolar = ref === 'BCV' ? 'BCV' : 'PARALELO';
  const moneda: Moneda = esMoneda(base) ? base : 'USD';
  const total = totalConsolidado(
    billeteras.filter((b) => b.en_total),
    moneda,
    cambioDe(tasas, referencia),
  );
  const patrimonio = total !== null ? `≈ ${formatearMonto(total, moneda)}` : '—';
  return {
    patrimonio,
    referencia: NOMBRE_PAR[referencia],
    bcv: tasas.BCV ? formatearTasa(tasas.BCV.tasa) : '—',
    paralelo: tasas.PARALELO ? formatearTasa(tasas.PARALELO.tasa) : '—',
    euro: tasas.EURO ? formatearTasa(tasas.EURO.tasa) : '—',
    actualizado: tasas.PARALELO?.consultada_en ? formatearHora(tasas.PARALELO.consultada_en) : '',
  };
}
