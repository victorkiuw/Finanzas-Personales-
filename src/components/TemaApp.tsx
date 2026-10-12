import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { guardarPreferencia, leerPreferencia } from '../db/preferencias';
import { crearTema, esAcento, type Acento } from '../lib/tema';

export type ModoTema = 'auto' | 'claro' | 'oscuro';

export const CLAVE_MODO_TEMA = 'tema_modo';
export const CLAVE_ACENTO = 'tema_acento';

interface Apariencia {
  modo: ModoTema;
  acento: Acento;
  cambiarModo: (m: ModoTema) => void;
  cambiarAcento: (a: Acento) => void;
}

const Contexto = createContext<Apariencia>({ modo: 'auto', acento: 'lima', cambiarModo: () => {}, cambiarAcento: () => {} });

export const useApariencia = () => useContext(Contexto);

/** Tema de toda la app: claro, oscuro o el del teléfono, con el color de acento elegido. */
export function TemaApp({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const sistema = useColorScheme();
  const [modo, setModo] = useState<ModoTema>('auto');
  const [acento, setAcento] = useState<Acento>('lima');

  useEffect(() => {
    leerPreferencia(db, CLAVE_MODO_TEMA)
      .then((v) => {
        if (v === 'auto' || v === 'claro' || v === 'oscuro') setModo(v);
      })
      .catch(() => {});
    leerPreferencia(db, CLAVE_ACENTO)
      .then((v) => {
        if (esAcento(v)) setAcento(v);
      })
      .catch(() => {});
  }, [db]);

  const oscuro = modo === 'auto' ? sistema === 'dark' : modo === 'oscuro';
  const tema = useMemo(() => crearTema(oscuro, acento), [oscuro, acento]);
  const valor = useMemo<Apariencia>(
    () => ({
      modo,
      acento,
      cambiarModo: (m) => {
        setModo(m);
        guardarPreferencia(db, CLAVE_MODO_TEMA, m).catch(() => {});
      },
      cambiarAcento: (a) => {
        setAcento(a);
        guardarPreferencia(db, CLAVE_ACENTO, a).catch(() => {});
      },
    }),
    [db, modo, acento],
  );

  return (
    <Contexto.Provider value={valor}>
      <PaperProvider theme={tema}>
        <StatusBar style={tema.dark ? 'light' : 'dark'} />
        {children}
      </PaperProvider>
    </Contexto.Provider>
  );
}
