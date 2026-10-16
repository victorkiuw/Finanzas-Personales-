import { StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { conAlfa } from '../lib/tema';

/** Ícono en un cuadrito redondeado con fondo suave de su color (categorías, billeteras). */
export function IconoCuadro({ icono, color, tamano = 44 }: { icono: string; color: string; tamano?: number }) {
  return (
    <View
      style={[
        styles.cuadro,
        { width: tamano, height: tamano, borderRadius: tamano * 0.32, backgroundColor: conAlfa(color, 0.22) },
      ]}
    >
      <Icon source={icono} size={tamano * 0.52} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  cuadro: { alignItems: 'center', justifyContent: 'center' },
});
