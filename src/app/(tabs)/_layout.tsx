import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import Tabs from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { View, type ColorValue } from 'react-native';
import { IconButton, useTheme } from 'react-native-paper';

import { useModoDiscreto } from '../../components/ModoDiscreto';

type NombreIcono = ComponentProps<typeof MaterialCommunityIcons>['name'];

const icono =
  (name: NombreIcono) =>
  ({ color, size }: { color: ColorValue; size: number }) => <MaterialCommunityIcons name={name} color={color} size={size} />;

export default function TabsLayout() {
  const tema = useTheme();
  const { discreto, alternar } = useModoDiscreto();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: tema.colors.surface },
        headerTintColor: tema.colors.onSurface,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: tema.colors.surface, borderTopColor: tema.colors.outlineVariant },
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
            <View style={{ flexDirection: 'row' }}>
              <IconButton
                icon={discreto ? 'eye-off' : 'eye'}
                accessibilityLabel={discreto ? 'Mostrar montos' : 'Ocultar todos los montos'}
                onPress={alternar}
              />
              <IconButton icon="cog" accessibilityLabel="Ajustes" onPress={() => router.push('/ajustes')} />
            </View>
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
