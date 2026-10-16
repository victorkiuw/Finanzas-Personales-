import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { vibrar } from '../lib/vibrar';

const Contexto = createContext<(texto?: string) => void>(() => {});

/** Muestra un check verde animado ("¡Listo!") al guardar algo. */
export function useListo() {
  return useContext(Contexto);
}

export function ConfirmacionListoProvider({ children }: { children: ReactNode }) {
  const tema = useTheme();
  const [texto, setTexto] = useState<string | null>(null);
  const escala = useRef(new Animated.Value(0)).current;
  const opacidad = useRef(new Animated.Value(0)).current;
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrar = useCallback(
    (t = '¡Listo!') => {
      if (temporizador.current) clearTimeout(temporizador.current);
      setTexto(t);
      vibrar('exito');
      escala.setValue(0.4);
      opacidad.setValue(0);
      Animated.parallel([
        Animated.spring(escala, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        Animated.timing(opacidad, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
      temporizador.current = setTimeout(() => {
        Animated.timing(opacidad, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setTexto(null));
      }, 900);
    },
    [escala, opacidad],
  );

  return (
    <Contexto.Provider value={mostrar}>
      {children}
      {texto !== null && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.centro}>
            <Animated.View
              style={[styles.caja, { backgroundColor: tema.colors.elevation.level3, opacity: opacidad, transform: [{ scale: escala }] }]}
            >
              <View style={[styles.circulo, { backgroundColor: tema.colors.primaryContainer }]}>
                <Icon source="check-bold" size={44} color={tema.colors.onPrimaryContainer} />
              </View>
              <Text variant="titleMedium" style={styles.texto}>
                {texto}
              </Text>
            </Animated.View>
          </View>
        </View>
      )}
    </Contexto.Provider>
  );
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  caja: { borderRadius: 28, paddingVertical: 24, paddingHorizontal: 32, alignItems: 'center', gap: 12, minWidth: 160 },
  circulo: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  texto: { fontWeight: '700', textAlign: 'center' },
});
