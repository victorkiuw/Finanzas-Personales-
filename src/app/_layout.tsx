import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef } from 'react';
import { useTheme } from 'react-native-paper';

import { Candado } from '../components/Candado';
import { ConfirmacionListoProvider } from '../components/ConfirmacionListo';
import { ModoDiscretoProvider } from '../components/ModoDiscreto';
import { TasasProvider } from '../components/TasasProvider';
import { TemaApp } from '../components/TemaApp';
import { migrar, NOMBRE_BD } from '../db/esquema';
import { actualizarAvisosRecurrentes, actualizarAvisosVencimientos, enviarResumenMensual } from '../lib/avisos';
import { configurarNotificaciones } from '../lib/notificaciones';
import { hacerCopiaAutomatica } from '../lib/respaldoAuto';

/** Al tocar un aviso que trae una pantalla (deuda que vence, cuota…), se abre esa pantalla. */
function AbrirDesdeAviso() {
  const respuesta = Notifications.useLastNotificationResponse();
  const abierta = useRef<string | null>(null);
  useEffect(() => {
    const id = respuesta?.notification.request.identifier;
    const ruta = respuesta?.notification.request.content.data?.ruta;
    if (!id || typeof ruta !== 'string' || abierta.current === id) return;
    abierta.current = id;
    // Un instante para que el navegador esté listo al abrir la app desde el aviso.
    setTimeout(() => router.push(ruta as never), 300);
  }, [respuesta]);
  return null;
}

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

/** Navegación con los colores del tema elegido. */
function Navegacion() {
  const tema = useTheme();
  return (
    <ConfirmacionListoProvider>
      <Candado>
        <ModoDiscretoProvider>
          {(discreto) => (
            <Stack
              // Al cambiar el modo discreto se vuelve a dibujar todo con los montos ocultos o visibles.
              key={discreto ? 'discreto' : 'normal'}
              screenOptions={{
                headerStyle: { backgroundColor: tema.colors.background },
                headerTintColor: tema.colors.onSurface,
                headerTitleStyle: { fontWeight: '700' },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: tema.colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
          )}
        </ModoDiscretoProvider>
      </Candado>
    </ConfirmacionListoProvider>
  );
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={NOMBRE_BD} onInit={migrar}>
      <Arranque />
      <AbrirDesdeAviso />
      <TasasProvider>
        <TemaApp>
          <Navegacion />
        </TemaApp>
      </TasasProvider>
    </SQLiteProvider>
  );
}
