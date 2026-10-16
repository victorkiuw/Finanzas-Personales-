import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { guardarPreferencia, leerPreferencia } from '../db/preferencias';
import { establecerModoDiscreto } from '../lib/moneda';

const CLAVE = 'modo_discreto';

const Contexto = createContext<{ discreto: boolean; alternar: () => void }>({ discreto: false, alternar: () => {} });

/**
 * Modo discreto: oculta todos los montos de la app a la vez. Al cambiarlo se
 * vuelve a dibujar todo lo que hay debajo (la `key` cambia) para que cada
 * formatearMonto lo tome en cuenta.
 */
export function ModoDiscretoProvider({ children }: { children: (discreto: boolean) => ReactNode }) {
  const db = useSQLiteContext();
  const [discreto, setDiscreto] = useState(false);

  useEffect(() => {
    leerPreferencia(db, CLAVE)
      .then((v) => {
        establecerModoDiscreto(v === '1');
        setDiscreto(v === '1');
      })
      .catch(() => {});
  }, [db]);

  const alternar = useCallback(() => {
    setDiscreto((actual) => {
      const nuevo = !actual;
      establecerModoDiscreto(nuevo);
      guardarPreferencia(db, CLAVE, nuevo ? '1' : '0').catch(() => {});
      return nuevo;
    });
  }, [db]);

  return <Contexto.Provider value={{ discreto, alternar }}>{children(discreto)}</Contexto.Provider>;
}

export function useModoDiscreto() {
  return useContext(Contexto);
}
