import { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

/** Relleno de barra que crece desde cero hasta `porcentaje` al aparecer o al cambiar. */
export function BarraAnimada({ porcentaje, style }: { porcentaje: number; style?: StyleProp<ViewStyle> }) {
  const valor = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(valor, {
      toValue: Math.min(Math.max(porcentaje, 0), 100),
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [porcentaje, valor]);
  return <Animated.View style={[style, { width: valor.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />;
}
