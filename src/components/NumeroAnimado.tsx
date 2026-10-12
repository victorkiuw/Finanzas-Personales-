import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type StyleProp, type TextStyle } from 'react-native';
import { Text } from 'react-native-paper';
import type { ComponentProps } from 'react';

/** Número que "corre" desde el valor anterior hasta el nuevo cuando cambia. */
export function NumeroAnimado({
  valor,
  formatear,
  style,
  variant,
  duracion = 650,
}: {
  valor: number;
  formatear: (v: number) => string;
  style?: StyleProp<TextStyle>;
  variant?: ComponentProps<typeof Text>['variant'];
  duracion?: number;
}) {
  const animado = useRef(new Animated.Value(valor)).current;
  const [mostrado, setMostrado] = useState(valor);
  const primero = useRef(true);

  useEffect(() => {
    const id = animado.addListener(({ value }) => setMostrado(Math.round(value)));
    return () => animado.removeListener(id);
  }, [animado]);

  useEffect(() => {
    // La primera vez cuenta desde cero; después, desde el valor anterior.
    if (primero.current) {
      primero.current = false;
      animado.setValue(0);
    }
    Animated.timing(animado, { toValue: valor, duration: duracion, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() =>
      setMostrado(valor),
    );
  }, [valor, animado, duracion]);

  return (
    <Text variant={variant} style={style} numberOfLines={1} adjustsFontSizeToFit>
      {formatear(mostrado)}
    </Text>
  );
}
