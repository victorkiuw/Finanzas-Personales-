import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { migrar, NOMBRE_BD } from '../db/esquema';
import { temaClaro, temaOscuro } from '../lib/tema';

export default function RootLayout() {
  const tema = useColorScheme() === 'dark' ? temaOscuro : temaClaro;

  return (
    <SQLiteProvider databaseName={NOMBRE_BD} onInit={migrar}>
      <PaperProvider theme={tema}>
        <StatusBar style={tema.dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: tema.colors.surface },
            headerTintColor: tema.colors.onSurface,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: tema.colors.background },
          }}
        />
      </PaperProvider>
    </SQLiteProvider>
  );
}
