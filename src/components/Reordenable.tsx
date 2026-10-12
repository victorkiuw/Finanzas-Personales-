import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { vibrar } from '../lib/vibrar';

const PRESION = 380;

interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Elementos que se reordenan dejándolos presionados y arrastrándolos (como los
 * íconos del teléfono). Sirve en cuadrícula (chips) o en columna (tarjetas).
 * Un toque normal sigue funcionando: solo al mantener presionado se "levanta".
 */
export function Reordenable<T>({
  items,
  clave,
  render,
  onReordenar,
  onArrastre,
  estilo,
}: {
  items: T[];
  clave: (item: T) => string | number;
  render: (item: T, levantado: boolean) => ReactNode;
  onReordenar: (nuevos: T[]) => void;
  /** Avisa al empezar/terminar para desactivar el desplazamiento de la pantalla. */
  onArrastre?: (activo: boolean) => void;
  estilo?: StyleProp<ViewStyle>;
}) {
  const [orden, setOrden] = useState(items);
  const [activo, setActivo] = useState<string | number | null>(null);
  const cajas = useRef(new Map<string | number, Caja>());
  const contenedor = useRef<View>(null);
  const origen = useRef({ x: 0, y: 0 });
  const dedo = useRef({ x: 0, y: 0 });
  const agarre = useRef({ x: 0, y: 0 });
  const desplazamiento = useRef(new Animated.ValueXY()).current;
  const escala = useRef(new Animated.Value(1)).current;
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toque = useRef<{ clave: string | number; x: number; y: number } | null>(null);
  const estado = useRef({ orden, activo, onReordenar, onArrastre, clave });
  estado.current = { orden, activo, onReordenar, onArrastre, clave };

  // Si cambian los elementos desde fuera (y no se está arrastrando), se toman los nuevos.
  useEffect(() => {
    if (estado.current.activo === null) setOrden(items);
  }, [items]);

  /** Mueve el elemento levantado para que siga al dedo, sea cual sea su lugar actual. */
  const seguirDedo = () => {
    const a = estado.current.activo;
    if (a === null) return;
    const caja = cajas.current.get(a);
    if (!caja) return;
    desplazamiento.setValue({ x: dedo.current.x - agarre.current.x - caja.x, y: dedo.current.y - agarre.current.y - caja.y });
  };

  const levantar = (k: string | number, x: number, y: number) => {
    const caja = cajas.current.get(k);
    if (!caja) return;
    agarre.current = { x: x - caja.x, y: y - caja.y };
    dedo.current = { x, y };
    desplazamiento.setValue({ x: 0, y: 0 });
    setActivo(k);
    estado.current.activo = k;
    estado.current.onArrastre?.(true);
    vibrar('media');
    Animated.spring(escala, { toValue: 1.08, friction: 6, useNativeDriver: false }).start();
  };

  const soltar = () => {
    const { activo: a, orden: o, onReordenar: reordenar, onArrastre: arrastre } = estado.current;
    if (a === null) return;
    Animated.parallel([
      Animated.spring(desplazamiento, { toValue: { x: 0, y: 0 }, friction: 7, useNativeDriver: false }),
      Animated.spring(escala, { toValue: 1, friction: 6, useNativeDriver: false }),
    ]).start(() => setActivo(null));
    estado.current.activo = null;
    arrastre?.(false);
    vibrar('suave');
    reordenar(o);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Los toques normales son de los hijos; solo se toma el gesto cuando ya se levantó un elemento.
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: () => estado.current.activo !== null,
        onMoveShouldSetPanResponder: () => estado.current.activo !== null,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (e) => {
          const { orden: o, clave: k, activo: a } = estado.current;
          if (a === null) return;
          dedo.current = { x: e.nativeEvent.pageX - origen.current.x, y: e.nativeEvent.pageY - origen.current.y };
          seguirDedo();
          // ¿Sobre qué elemento está el dedo? Ahí va el levantado.
          const destino = o.findIndex((it) => {
            const c = cajas.current.get(k(it));
            return c && dedo.current.x >= c.x && dedo.current.x <= c.x + c.w && dedo.current.y >= c.y && dedo.current.y <= c.y + c.h;
          });
          const desde = o.findIndex((it) => k(it) === a);
          if (destino >= 0 && destino !== desde) {
            const nuevo = [...o];
            const [movido] = nuevo.splice(desde, 1);
            nuevo.splice(destino, 0, movido);
            estado.current.orden = nuevo;
            setOrden(nuevo);
            vibrar('suave');
          }
        },
        onPanResponderRelease: soltar,
        onPanResponderTerminate: soltar,
      }),
    [],
  );

  const cancelarPresion = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  };

  return (
    <View ref={contenedor} style={estilo} {...pan.panHandlers}>
      {orden.map((it) => {
        const k = clave(it);
        const levantado = activo === k;
        return (
          <Animated.View
            key={k}
            onLayout={(e) => {
              const { x, y, width, height } = e.nativeEvent.layout;
              cajas.current.set(k, { x, y, w: width, h: height });
              if (levantado) seguirDedo();
            }}
            onTouchStart={(e) => {
              // Posición del dedo en la pantalla; el origen del contenedor se mide ahora para pasarla a coordenadas propias.
              toque.current = { clave: k, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
              contenedor.current?.measureInWindow((cx, cy) => {
                origen.current = { x: cx, y: cy };
              });
              cancelarPresion();
              temporizador.current = setTimeout(() => {
                const t = toque.current;
                if (t?.clave === k) levantar(k, t.x - origen.current.x, t.y - origen.current.y);
              }, PRESION);
            }}
            onTouchMove={(e) => {
              const t = toque.current;
              if (!t || estado.current.activo !== null) return;
              // Si se mueve antes de tiempo, es un desplazamiento normal: no se levanta.
              if (Math.hypot(e.nativeEvent.pageX - t.x, e.nativeEvent.pageY - t.y) > 10) cancelarPresion();
            }}
            onTouchEnd={() => {
              cancelarPresion();
              // Levantado pero soltado sin moverlo: se deja en su sitio.
              if (estado.current.activo === k) soltar();
            }}
            onTouchCancel={cancelarPresion}
            style={[
              levantado && styles.levantado,
              levantado && { transform: [...desplazamiento.getTranslateTransform(), { scale: escala }] },
            ]}
          >
            {render(it, levantado)}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  levantado: { zIndex: 10, elevation: 8, opacity: 0.95 },
});
