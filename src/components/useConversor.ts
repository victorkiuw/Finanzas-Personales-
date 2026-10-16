import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { Conversor } from '../db/reportes';
import { listarHistorial } from '../db/tasas';
import { useTasas } from './TasasProvider';

/**
 * Conversor con el historial de tasas (cada movimiento a la tasa de su día),
 * según la tasa de referencia elegida. Se recarga al llegar tasas nuevas.
 */
export function useConversor(): Conversor | null {
  const db = useSQLiteContext();
  const { referencia, cambio, versionHistorial } = useTasas();
  const [conversor, setConversor] = useState<Conversor | null>(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([listarHistorial(db, referencia), listarHistorial(db, 'EURO'), listarHistorial(db, 'BCV'), listarHistorial(db, 'PARALELO')])
      .then(([historial, euro, bcv, usdt]) => {
        if (vigente) setConversor(new Conversor(historial, cambio.dolar, { euro, bcv }, cambio.euro, usdt));
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [db, referencia, cambio.dolar, cambio.euro, versionHistorial]);

  return conversor;
}
