import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { guardarPreferencia, leerPreferencia } from '../db/preferencias';
import {
  actualizarTasasDesdeApi,
  cambioDe,
  guardarTasa,
  obtenerTasas,
  sincronizarHistorico,
  tasasVencidas,
  type Tasas,
} from '../db/tasas';
import { ErrorTasas, type Par, type ParDolar } from '../lib/api-tasas';
import type { Cambio } from '../lib/conversion';
import { revisarAlertasTasa } from '../lib/avisos';
import { esMoneda, type Moneda } from '../lib/moneda';

interface ContextoTasas {
  tasas: Tasas;
  actualizando: boolean;
  /** Mensaje del último intento fallido de actualizar (se limpia al tener éxito). */
  error: string | null;
  /** Consulta la API. Sin `forzar`, solo lo hace si el caché está vencido. */
  actualizar: (forzar?: boolean) => Promise<void>;
  guardarManual: (par: Par, tasa: number) => Promise<void>;
  /** Tasa del dólar usada para el total consolidado. */
  referencia: ParDolar;
  cambiarReferencia: (par: ParDolar) => void;
  /** Tasas vigentes (dólar según la referencia y euro) para convertir. */
  cambio: Cambio;
  /** Moneda en la que se muestra el total consolidado. */
  monedaBase: Moneda;
  cambiarMonedaBase: (m: Moneda) => void;
  /** Cambia cada vez que se actualiza el historial de tasas (para recalcular reportes). */
  versionHistorial: number;
  /** Tasa propia (la de tu banco o casa de cambio), en Bs. por dólar. */
  propia: { nombre: string; tasa: number } | null;
  guardarPropia: (propia: { nombre: string; tasa: number } | null) => Promise<void>;
}

const Contexto = createContext<ContextoTasas | null>(null);

const CLAVE_REFERENCIA = 'tasa_referencia';
const CLAVE_BASE = 'moneda_base';
const CLAVE_PROPIA = 'tasa_propia';

export function TasasProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [tasas, setTasas] = useState<Tasas>({});
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referencia, setReferencia] = useState<ParDolar>('PARALELO');
  const [monedaBase, setMonedaBase] = useState<Moneda>('USD');
  const [versionHistorial, setVersionHistorial] = useState(0);
  const [propia, setPropia] = useState<{ nombre: string; tasa: number } | null>(null);
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
        await revisarAlertasTasa(db, nuevas).catch(() => {});
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
      const [cache, ref, base, guardada] = await Promise.all([
        obtenerTasas(db),
        leerPreferencia(db, CLAVE_REFERENCIA),
        leerPreferencia(db, CLAVE_BASE),
        leerPreferencia(db, CLAVE_PROPIA),
      ]);
      try {
        const p = guardada ? JSON.parse(guardada) : null;
        if (p && typeof p.nombre === 'string' && p.tasa > 0) setPropia(p);
      } catch {
        // Preferencia dañada: se ignora.
      }
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
    (par: ParDolar) => {
      setReferencia(par);
      guardarPreferencia(db, CLAVE_REFERENCIA, par).catch(() => {});
    },
    [db],
  );

  const guardarPropia = useCallback(
    async (p: { nombre: string; tasa: number } | null) => {
      if (p) await guardarPreferencia(db, CLAVE_PROPIA, JSON.stringify(p));
      else await db.runAsync(`DELETE FROM preferencias WHERE clave = ?`, [CLAVE_PROPIA]);
      setPropia(p);
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
        cambio: cambioDe(tasas, referencia),
        monedaBase,
        cambiarMonedaBase,
        versionHistorial,
        propia,
        guardarPropia,
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
