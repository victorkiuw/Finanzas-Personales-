import { useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { vibrar } from '../lib/vibrar';

const UMBRAL = 90;

/**
 * Fila que se desliza con el dedo: a la izquierda muestra "Eliminar" (rojo) y a
 * la derecha "Duplicar" (azul). Pasado el umbral, al soltar hace la acción.
 */
export function FilaDeslizable({
  children,
  onEliminar,
  onDuplicar,
}: {
  children: ReactNode;
  onEliminar?: () => void;
  onDuplicar?: () => void;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const avisado = useRef(false);
  const acciones = useRef({ onEliminar, onDuplicar });
  acciones.current = { onEliminar, onDuplicar };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Solo toma el gesto si es claramente horizontal (el vertical es para desplazarse).
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
        onPanResponderGrant: () => {
          avisado.current = false;
        },
        onPanResponderMove: (_, g) => {
          const { onEliminar: elim, onDuplicar: dup } = acciones.current;
          const dx = (g.dx < 0 && !elim) || (g.dx > 0 && !dup) ? g.dx * 0.2 : g.dx;
          x.setValue(dx);
          if (!avisado.current && Math.abs(g.dx) > UMBRAL) {
            avisado.current = true;
            vibrar('media');
          }
        },
        onPanResponderRelease: (_, g) => {
          const { onEliminar: elim, onDuplicar: dup } = acciones.current;
          if (g.dx < -UMBRAL && elim) {
            Animated.timing(x, { toValue: -500, duration: 180, useNativeDriver: true }).start(() => {
              elim();
              x.setValue(0);
            });
            return;
          }
          if (g.dx > UMBRAL && dup) dup();
          Animated.spring(x, { toValue: 0, friction: 7, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(x, { toValue: 0, friction: 7, useNativeDriver: true }).start();
        },
      }),
    [x],
  );

  const opacidadElim = x.interpolate({ inputRange: [-UMBRAL, -20, 0], outputRange: [1, 0.4, 0], extrapolate: 'clamp' });
  const opacidadDup = x.interpolate({ inputRange: [0, 20, UMBRAL], outputRange: [0, 0.4, 1], extrapolate: 'clamp' });

  return (
    <View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.fondo, styles.duplicar, { opacity: opacidadDup }]}>
        <Icon source="content-copy" size={22} color="#FFFFFF" />
        <Text variant="labelLarge" style={styles.texto}>
          Duplicar
        </Text>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.fondo, styles.eliminar, { opacity: opacidadElim }]}>
        <Text variant="labelLarge" style={styles.texto}>
          Eliminar
        </Text>
        <Icon source="trash-can-outline" size={22} color="#FFFFFF" />
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  duplicar: { backgroundColor: '#2563EB', justifyContent: 'flex-start' },
  eliminar: { backgroundColor: '#DC2626', justifyContent: 'flex-end' },
  texto: { color: '#FFFFFF' },
});
