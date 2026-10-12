import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { guardarPreferencia, leerPreferencia } from '../db/preferencias';
import { vibrar } from '../lib/vibrar';

const TAMANO = 60;
const MARGEN = 16;
const CLAVE_POSICION = 'boton_flotante_pos';
const CLAVE_ULTIMO = 'boton_flotante_ultimo';
/** Mantener presionado más de esto (sin moverlo) abre directo el último usado. */
const PRESION_LARGA = 450;

type Tipo = 'GASTO' | 'INGRESO' | 'TRANSFERENCIA' | 'DICTAR';

interface Accion {
  tipo: Tipo;
  texto: string;
  icono: string;
  color: string;
}

const ACCIONES: Accion[] = [
  { tipo: 'GASTO', texto: 'Gasto', icono: 'arrow-up', color: '#EF4444' },
  { tipo: 'INGRESO', texto: 'Ingreso', icono: 'arrow-down', color: '#22C55E' },
  { tipo: 'TRANSFERENCIA', texto: 'Transferir', icono: 'swap-horizontal', color: '#3B82F6' },
  { tipo: 'DICTAR', texto: 'Dictar', icono: 'microphone', color: '#A855F7' },
];

/**
 * Botón + flotante: se arrastra con el dedo y queda pegado al borde más
 * cercano (recuerda dónde se dejó). Al tocarlo se abre en abanico Gasto,
 * Ingreso, Transferir y Dictar; dejándolo presionado abre directo el último usado.
 */
export function BotonFlotante({ onDictar }: { onDictar?: () => void }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [area, setArea] = useState<{ ancho: number; alto: number } | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [lado, setLado] = useState<'izq' | 'der'>('der');
  const [arriba, setArriba] = useState(false);
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const actual = useRef({ x: 0, y: 0 });
  const guardada = useRef<{ lado: 'izq' | 'der'; fraccion: number } | null>(null);
  const ultimo = useRef<Tipo>('GASTO');
  const abanico = useRef(new Animated.Value(0)).current;
  const acciones = ACCIONES.filter((a) => a.tipo !== 'DICTAR' || onDictar);

  useEffect(() => {
    leerPreferencia(db, CLAVE_POSICION)
      .then((v) => {
        if (!v) return;
        const p = JSON.parse(v);
        if ((p.lado === 'izq' || p.lado === 'der') && typeof p.fraccion === 'number') guardada.current = p;
        if (estado.current.area) colocar(estado.current.area);
      })
      .catch(() => {});
    leerPreferencia(db, CLAVE_ULTIMO)
      .then((v) => {
        if (v === 'GASTO' || v === 'INGRESO' || v === 'TRANSFERENCIA' || v === 'DICTAR') ultimo.current = v;
      })
      .catch(() => {});
    // Solo al montar.
  }, [db]);

  const limites = (a: { ancho: number; alto: number }) => ({
    izq: MARGEN,
    der: a.ancho - TAMANO - MARGEN,
    min: MARGEN,
    max: a.alto - TAMANO - MARGEN,
  });

  const fijar = (x: number, y: number) => {
    actual.current = { x, y };
    pos.setValue({ x, y });
  };

  const colocar = (a: { ancho: number; alto: number }) => {
    const l = limites(a);
    const g = guardada.current ?? { lado: 'der' as const, fraccion: 1 };
    setLado(g.lado);
    const y = l.min + (l.max - l.min) * g.fraccion;
    setArriba(y < a.alto / 2);
    fijar(g.lado === 'izq' ? l.izq : l.der, y);
  };

  const alMedir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const nueva = { ancho: width, alto: height };
    setArea(nueva);
    colocar(nueva);
  };

  const abrirTipo = (tipo: Tipo) => {
    setAbierto(false);
    ultimo.current = tipo;
    guardarPreferencia(db, CLAVE_ULTIMO, tipo).catch(() => {});
    if (tipo === 'DICTAR') onDictar?.();
    else router.push({ pathname: '/movimiento/nuevo', params: { tipo } });
  };

  const alternarMenu = (abrir: boolean) => {
    setAbierto(abrir);
    if (abrir) vibrar('media');
    abanico.setValue(abrir ? 0 : 1);
    Animated.spring(abanico, { toValue: abrir ? 1 : 0, friction: 6, tension: 90, useNativeDriver: true }).start();
  };

  // Refs para que el PanResponder (creado una vez) vea el estado actual.
  const estado = useRef({ area, abierto });
  estado.current = { area, abierto };
  const inicio = useRef({ x: 0, y: 0 });
  const arrastrando = useRef(false);
  const larga = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usoLarga = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          inicio.current = { ...actual.current };
          arrastrando.current = false;
          usoLarga.current = false;
          larga.current = setTimeout(() => {
            if (!arrastrando.current && !estado.current.abierto) {
              usoLarga.current = true;
              vibrar('media');
              abrirTipo(ultimo.current);
            }
          }, PRESION_LARGA);
        },
        onPanResponderMove: (_, g) => {
          if (!arrastrando.current && Math.hypot(g.dx, g.dy) > 8) {
            arrastrando.current = true;
            if (larga.current) clearTimeout(larga.current);
            if (estado.current.abierto) setAbierto(false);
            vibrar('suave');
          }
          if (arrastrando.current) pos.setValue({ x: inicio.current.x + g.dx, y: inicio.current.y + g.dy });
        },
        onPanResponderRelease: (_, g) => {
          if (larga.current) clearTimeout(larga.current);
          const a = estado.current.area;
          if (!arrastrando.current) {
            if (!usoLarga.current) alternarMenu(!estado.current.abierto);
            return;
          }
          if (!a) return;
          const l = limites(a);
          const x = inicio.current.x + g.dx;
          const y = Math.min(Math.max(inicio.current.y + g.dy, l.min), l.max);
          const nuevoLado = x + TAMANO / 2 < a.ancho / 2 ? 'izq' : 'der';
          const destino = { x: nuevoLado === 'izq' ? l.izq : l.der, y };
          actual.current = destino;
          setLado(nuevoLado);
          setArriba(y < a.alto / 2);
          Animated.spring(pos, { toValue: destino, friction: 7, useNativeDriver: false }).start();
          vibrar('suave');
          guardada.current = { lado: nuevoLado, fraccion: l.max > l.min ? (y - l.min) / (l.max - l.min) : 1 };
          guardarPreferencia(db, CLAVE_POSICION, JSON.stringify(guardada.current)).catch(() => {});
        },
        onPanResponderTerminate: () => {
          if (larga.current) clearTimeout(larga.current);
        },
      }),
    // Las funciones usan refs; el responder se crea una sola vez.
    [],
  );

  const giro = abanico.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={alMedir}>
      {abierto && (
        <Pressable style={[StyleSheet.absoluteFill, styles.velo]} onPress={() => alternarMenu(false)} accessibilityLabel="Cerrar menú" />
      )}
      {area && (
        <Animated.View style={[styles.contenedor, { transform: pos.getTranslateTransform() }]} pointerEvents="box-none">
          {abierto && (
            <View
              style={[
                styles.abanico,
                arriba ? { top: TAMANO + 12 } : { bottom: TAMANO + 12 },
                lado === 'der' ? { right: 0, alignItems: 'flex-end' } : { left: 0, alignItems: 'flex-start' },
              ]}
            >
              {(arriba ? acciones : [...acciones].reverse()).map((a, i) => (
                <Animated.View
                  key={a.tipo}
                  style={{
                    opacity: abanico,
                    transform: [
                      { translateY: abanico.interpolate({ inputRange: [0, 1], outputRange: [arriba ? -20 * (i + 1) : 20 * (i + 1), 0] }) },
                      { scale: abanico.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                    ],
                  }}
                >
                  <Pressable
                    onPress={() => abrirTipo(a.tipo)}
                    accessibilityRole="button"
                    accessibilityLabel={a.texto}
                    style={[styles.accion, lado === 'izq' && styles.accionIzq]}
                  >
                    <View style={[styles.etiqueta, { backgroundColor: tema.colors.elevation.level3 }]}>
                      <Text variant="labelLarge">{a.texto}</Text>
                    </View>
                    <View style={[styles.mini, { backgroundColor: a.color }]}>
                      <Icon source={a.icono} size={22} color="#FFFFFF" />
                    </View>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          )}
          <View
            {...panResponder.panHandlers}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Nuevo movimiento. Toca para elegir, mantén presionado para el último, arrastra para moverlo."
            style={[styles.boton, { backgroundColor: tema.colors.primaryContainer }]}
          >
            <Animated.View style={{ transform: [{ rotate: giro }] }}>
              <Icon source="plus" size={30} color={tema.colors.onPrimaryContainer} />
            </Animated.View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  velo: { backgroundColor: 'rgba(0,0,0,0.55)' },
  contenedor: { position: 'absolute', left: 0, top: 0, width: TAMANO, height: TAMANO },
  boton: {
    width: TAMANO,
    height: TAMANO,
    borderRadius: TAMANO / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  abanico: { position: 'absolute', gap: 12, width: 220 },
  accion: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accionIzq: { flexDirection: 'row-reverse' },
  etiqueta: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  mini: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
});
