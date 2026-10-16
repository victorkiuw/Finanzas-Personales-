import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

/**
 * Ventana que sube desde abajo (como en las apps de bancos). Se cierra tocando
 * fuera o deslizándola hacia abajo desde la barrita.
 */
export function HojaInferior({
  visible,
  titulo,
  onCerrar,
  children,
}: {
  visible: boolean;
  titulo?: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const tema = useTheme();
  const { height } = useWindowDimensions();
  const y = useRef(new Animated.Value(height)).current;
  const [montada, setMontada] = useState(visible);
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;

  useEffect(() => {
    if (visible) {
      setMontada(true);
      y.setValue(height);
      Animated.spring(y, { toValue: 0, friction: 9, tension: 70, useNativeDriver: true }).start();
    } else if (montada) {
      Animated.timing(y, { toValue: height, duration: 200, useNativeDriver: true }).start(() => setMontada(false));
    }
  }, [visible]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6,
        onPanResponderMove: (_, g) => y.setValue(Math.max(g.dy, 0)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 100 || g.vy > 1) cerrarRef.current();
          else Animated.spring(y, { toValue: 0, friction: 8, useNativeDriver: true }).start();
        },
      }),
    [y],
  );

  const velo = y.interpolate({ inputRange: [0, height], outputRange: [0.55, 0], extrapolate: 'clamp' });

  return (
    <Modal visible={montada} transparent animationType="none" onRequestClose={onCerrar} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: velo }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onCerrar} accessibilityLabel="Cerrar" />
      <Animated.View
        style={[styles.hoja, { backgroundColor: tema.colors.elevation.level2, maxHeight: height * 0.75, transform: [{ translateY: y }] }]}
      >
        <View {...pan.panHandlers} style={styles.agarre}>
          <View style={[styles.barrita, { backgroundColor: tema.colors.outline }]} />
          {titulo && (
            <Text variant="titleMedium" style={styles.titulo}>
              {titulo}
            </Text>
          )}
        </View>
        <ScrollView contentContainerStyle={styles.contenido}>{children}</ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hoja: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 24 },
  agarre: { alignItems: 'center', paddingTop: 10, paddingBottom: 8, gap: 10 },
  barrita: { width: 40, height: 5, borderRadius: 3 },
  titulo: { fontWeight: '700' },
  contenido: { paddingHorizontal: 8, paddingBottom: 8 },
});
