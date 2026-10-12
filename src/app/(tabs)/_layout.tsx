import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import Tabs from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { View, type ColorValue } from 'react-native';
import { IconButton, useTheme } from 'react-native-paper';

import { coloresExtra } from '../../lib/tema';

type NombreIcono = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Ícono de pestaña; la elegida va dentro de una pastilla de color (como en Rial). */
const icono =
  (name: NombreIcono) =>
  ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <PastillaIcono activa={focused}>
      <MaterialCommunityIcons name={name} color={color} size={size} />
    </PastillaIcono>
  );

function PastillaIcono({ activa, children }: { activa: boolean; children: React.ReactNode }) {
  const tema = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 18,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: activa ? tema.colors.secondaryContainer : 'transparent',
      }}
    >
      {children}
    </View>
  );
}

export default function TabsLayout() {
  const tema = useTheme();
  const extra = coloresExtra(tema.dark);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: tema.colors.background },
        headerTintColor: tema.colors.onSurface,
        headerTitleAlign: 'center',
        headerTitleStyle: { fontWeight: '800', fontSize: 22 },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: extra.barra, borderTopWidth: 0, height: 68, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, marginTop: 2 },
        tabBarActiveTintColor: tema.colors.primary,
        tabBarInactiveTintColor: tema.colors.onSurfaceVariant,
        sceneStyle: { backgroundColor: tema.colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          headerTitle: 'Resumen',
          tabBarIcon: icono('home'),
          headerRight: () => (
            <IconButton
              icon="cog-outline"
              mode="outlined"
              accessibilityLabel="Ajustes"
              onPress={() => router.push('/ajustes')}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="billeteras"
        options={{
          title: 'Billeteras',
          headerTitle: 'Mis billeteras',
          tabBarIcon: icono('wallet'),
          headerRight: () => (
            <IconButton
              icon="wallet-plus"
              mode="outlined"
              accessibilityLabel="Nueva billetera"
              onPress={() => router.push('/billetera/nueva')}
            />
          ),
        }}
      />
      <Tabs.Screen name="movimientos" options={{ title: 'Movimientos', tabBarIcon: icono('swap-vertical') }} />
      <Tabs.Screen name="ahorros" options={{ title: 'Ahorros', headerTitle: 'Ahorros y deudas', tabBarIcon: icono('piggy-bank') }} />
      <Tabs.Screen
        name="tasas"
        options={{ title: 'Tasas', headerTitle: 'Tasas y calculadora', tabBarIcon: icono('calculator-variant') }}
      />
    </Tabs>
  );
}
