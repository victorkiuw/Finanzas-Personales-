import * as LocalAuthentication from 'expo-local-authentication';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';

import { leerPreferencia } from '../db/preferencias';

export const CLAVE_BLOQUEO = 'bloqueo_activo';
/** Tras este tiempo en segundo plano se vuelve a pedir la huella. */
const MINUTOS_GRACIA = 1;

export async function autenticar(motivo: string): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: motivo, cancelLabel: 'Cancelar' });
  return r.success;
}

/** ¿El teléfono tiene huella, cara o al menos PIN/patrón configurado? */
export async function puedeBloquear(): Promise<boolean> {
  const nivel = await LocalAuthentication.getEnrolledLevelAsync();
  return nivel !== LocalAuthentication.SecurityLevel.NONE;
}

/**
 * Tapa la app con una pantalla de desbloqueo al abrirla y al volver después de
 * un minuto en segundo plano, si el bloqueo está activado en Ajustes.
 */
export function Candado({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [activo, setActivo] = useState<boolean | null>(null);
  const [bloqueada, setBloqueada] = useState(true);
  const salioEn = useRef<number | null>(null);

  const desbloquear = useCallback(async () => {
    if (await autenticar('Desbloquea Finanzas')) setBloqueada(false);
  }, []);

  useEffect(() => {
    leerPreferencia(db, CLAVE_BLOQUEO)
      .then((v) => {
        const on = v === '1';
        setActivo(on);
        if (on) desbloquear();
        else setBloqueada(false);
      })
      .catch(() => {
        setActivo(false);
        setBloqueada(false);
      });
  }, [db, desbloquear]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (estado) => {
      if (estado === 'background') salioEn.current = Date.now();
      if (estado !== 'active' || salioEn.current === null) return;
      const fuera = Date.now() - salioEn.current;
      salioEn.current = null;
      // El ajuste puede haber cambiado mientras tanto.
      const on = (await leerPreferencia(db, CLAVE_BLOQUEO).catch(() => null)) === '1';
      setActivo(on);
      if (on && fuera > MINUTOS_GRACIA * 60_000) {
        setBloqueada(true);
        desbloquear();
      }
    });
    return () => sub.remove();
  }, [db, desbloquear]);

  if (activo === null) return null;
  if (!bloqueada) return <>{children}</>;
  return (
    <View style={[styles.pantalla, { backgroundColor: tema.colors.background }]}>
      <Icon source="lock" size={56} color={tema.colors.primary} />
      <Text variant="titleLarge">Finanzas está bloqueada</Text>
      <Button mode="contained" icon="fingerprint" onPress={desbloquear}>
        Desbloquear
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
});
