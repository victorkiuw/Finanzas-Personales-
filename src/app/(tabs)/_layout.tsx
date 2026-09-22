import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import Tabs from 'expo-router/js-tabs';
import { IconButton, useTheme } from 'react-native-paper';

export default function TabsLayout() {
  const tema = useTheme();

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
          title: 'Billeteras',
          headerTitle: 'Mis billeteras',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="wallet" color={color} size={size} />,
          headerRight: () => (
            <IconButton
              icon="wallet-plus"
              accessibilityLabel="Nueva billetera"
              onPress={() => router.push('/billetera/nueva')}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="movimientos"
        options={{
          title: 'Movimientos',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="swap-vertical" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
