import { useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder } from 'react-native';

import { vibrar } from '../lib/vibrar';

/**
 * Zona que cambia de mes al deslizar a los lados: hacia la derecha el mes
 * anterior, hacia la izquierda el siguiente (si se puede).
 */
export function DeslizarMes({
  mes,
  onCambio,
  children,
}: {
  mes: Date;
  onCambio: (mes: Date) => void;
  children: ReactNode;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const estado = useRef({ mes, onCambio });
  estado.current = { mes, onCambio };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderMove: (_, g) => x.setValue(g.dx * 0.35),
        onPanResponderRelease: (_, g) => {
          const { mes: m, onCambio: cambiar } = estado.current;
          const hoy = new Date();
          const esActual = m.getFullYear() === hoy.getFullYear() && m.getMonth() === hoy.getMonth();
          if (g.dx > 70) {
            vibrar('suave');
            cambiar(new Date(m.getFullYear(), m.getMonth() - 1, 1));
          } else if (g.dx < -70 && !esActual) {
            vibrar('suave');
            cambiar(new Date(m.getFullYear(), m.getMonth() + 1, 1));
          }
          Animated.spring(x, { toValue: 0, friction: 7, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, friction: 7, useNativeDriver: true }).start(),
      }),
    [x],
  );

  return (
    <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
      {children}
    </Animated.View>
  );
}
