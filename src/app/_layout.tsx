import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { Candado } from '../components/Candado';
import { ModoDiscretoProvider } from '../components/ModoDiscreto';
import { TasasProvider } from '../components/TasasProvider';
import { migrar, NOMBRE_BD } from '../db/esquema';
import { actualizarAvisosRecurrentes, actualizarAvisosVencimientos, enviarResumenMensual } from '../lib/avisos';
import { configurarNotificaciones } from '../lib/notificaciones';
import { hacerCopiaAutomatica } from '../lib/respaldoAuto';
import { temaClaro, temaOscuro } from '../lib/tema';

/** Tareas al abrir la app que necesitan la base de datos. */
function Arranque() {
  const db = useSQLiteContext();
  useEffect(() => {
    configurarNotificaciones()
      .then(async () => {
        await actualizarAvisosRecurrentes(db);
        await actualizarAvisosVencimientos(db);
        await enviarResumenMensual(db);
      })
      .catch(() => {});
    // Copia de seguridad diaria dentro del teléfono.
    hacerCopiaAutomatica(db).catch(() => {});
  }, [db]);
  return null;
}

export default function RootLayout() {
  const tema = useColorScheme() === 'dark' ? temaOscuro : temaClaro;

  return (
    <SQLiteProvider databaseName={NOMBRE_BD} onInit={migrar}>
      <Arranque />
      <TasasProvider>
        <PaperProvider theme={tema}>
          <StatusBar style={tema.dark ? 'light' : 'dark'} />
          <Candado>
            <ModoDiscretoProvider>
              {(discreto) => (
                <Stack
                  // Al cambiar el modo discreto se vuelve a dibujar todo con los montos ocultos o visibles.
                  key={discreto ? 'discreto' : 'normal'}
                  screenOptions={{
                    headerStyle: { backgroundColor: tema.colors.surface },
                    headerTintColor: tema.colors.onSurface,
                    headerShadowVisible: false,
                    contentStyle: { backgroundColor: tema.colors.background },
                  }}
                >
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                </Stack>
              )}
            </ModoDiscretoProvider>
          </Candado>
        </PaperProvider>
      </TasasProvider>
    </SQLiteProvider>
  );
}
