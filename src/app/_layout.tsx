import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { TasasProvider } from '../components/TasasProvider';
import { migrar, NOMBRE_BD } from '../db/esquema';
import { actualizarAvisosRecurrentes } from '../lib/avisos';
import { configurarNotificaciones } from '../lib/notificaciones';
import { temaClaro, temaOscuro } from '../lib/tema';

/** Tareas al abrir la app que necesitan la base de datos. */
function Arranque() {
  const db = useSQLiteContext();
  useEffect(() => {
    configurarNotificaciones()
      .then(() => actualizarAvisosRecurrentes(db))
      .catch(() => {});
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
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: tema.colors.surface },
            headerTintColor: tema.colors.onSurface,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: tema.colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </PaperProvider>
      </TasasProvider>
    </SQLiteProvider>
  );
}
