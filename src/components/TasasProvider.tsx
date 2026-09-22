import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { guardarPreferencia, leerPreferencia } from '../db/preferencias';
import {
  actualizarTasasDesdeApi,
  guardarTasa,
  obtenerTasas,
  sincronizarHistorico,
  tasasVencidas,
  type Tasas,
} from '../db/tasas';
import { ErrorTasas, type Par } from '../lib/api-tasas';
import { esMoneda, type Moneda } from '../lib/moneda';

interface ContextoTasas {
  tasas: Tasas;
  actualizando: boolean;
  /** Mensaje del último intento fallido de actualizar (se limpia al tener éxito). */
  error: string | null;
  /** Consulta la API. Sin `forzar`, solo lo hace si el caché está vencido. */
  actualizar: (forzar?: boolean) => Promise<void>;
  guardarManual: (par: Par, tasa: number) => Promise<void>;
  /** Tasa usada para el total consolidado. */
  referencia: Par;
  cambiarReferencia: (par: Par) => void;
  /** Moneda en la que se muestra el total consolidado. */
  monedaBase: Moneda;
  cambiarMonedaBase: (m: Moneda) => void;
  /** Cambia cada vez que se actualiza el historial de tasas (para recalcular reportes). */
  versionHistorial: number;
}

const Contexto = createContext<ContextoTasas | null>(null);

const CLAVE_REFERENCIA = 'tasa_referencia';
const CLAVE_BASE = 'moneda_base';

export function TasasProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [tasas, setTasas] = useState<Tasas>({});
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referencia, setReferencia] = useState<Par>('PARALELO');
  const [monedaBase, setMonedaBase] = useState<Moneda>('USD');
  const [versionHistorial, setVersionHistorial] = useState(0);
  const tasasRef = useRef<Tasas>({});
  const enCurso = useRef(false);

  const actualizar = useCallback(
    async (forzar = false) => {
      if (enCurso.current || (!forzar && !tasasVencidas(tasasRef.current))) return;
      enCurso.current = true;
      setActualizando(true);
      try {
        const nuevas = await actualizarTasasDesdeApi(db);
        tasasRef.current = nuevas;
        setTasas(nuevas);
        setError(null);
        // El histórico diario (para reportes) se baja como mucho una vez al día; si falla no es grave.
        await sincronizarHistorico(db).catch(() => false);
        setVersionHistorial((v) => v + 1);
      } catch (e) {
        setError(e instanceof ErrorTasas ? e.message : 'No se pudieron actualizar las tasas.');
      } finally {
        enCurso.current = false;
        setActualizando(false);
      }
    },
    [db],
  );

  useEffect(() => {
    (async () => {
      const [cache, ref, base] = await Promise.all([
        obtenerTasas(db),
        leerPreferencia(db, CLAVE_REFERENCIA),
        leerPreferencia(db, CLAVE_BASE),
      ]);
      tasasRef.current = cache;
      setTasas(cache);
      if (ref === 'BCV' || ref === 'PARALELO') setReferencia(ref);
      if (esMoneda(base)) setMonedaBase(base);
      await actualizar();
    })().catch(() => {});

    // Al volver a la app después de un rato se refrescan si están vencidas.
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') actualizar().catch(() => {});
    });
    return () => sub.remove();
  }, [db, actualizar]);

  const guardarManual = useCallback(
    async (par: Par, tasa: number) => {
      await guardarTasa(db, par, { tasa, fecha: new Date().toISOString() }, 'MANUAL');
      const nuevas = await obtenerTasas(db);
      tasasRef.current = nuevas;
      setTasas(nuevas);
      setVersionHistorial((v) => v + 1);
    },
    [db],
  );

  const cambiarReferencia = useCallback(
    (par: Par) => {
      setReferencia(par);
      guardarPreferencia(db, CLAVE_REFERENCIA, par).catch(() => {});
    },
    [db],
  );

  const cambiarMonedaBase = useCallback(
    (m: Moneda) => {
      setMonedaBase(m);
      guardarPreferencia(db, CLAVE_BASE, m).catch(() => {});
    },
    [db],
  );

  return (
    <Contexto.Provider
      value={{
        tasas,
        actualizando,
        error,
        actualizar,
        guardarManual,
        referencia,
        cambiarReferencia,
        monedaBase,
        cambiarMonedaBase,
        versionHistorial,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useTasas(): ContextoTasas {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useTasas debe usarse dentro de <TasasProvider>.');
  return ctx;
}
