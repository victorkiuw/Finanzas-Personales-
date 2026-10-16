import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Deja espacio abajo cuando sale el teclado, para que lo que se escribe no
 * quede tapado. En Android la app se dibuja bajo las barras del sistema y la
 * ventana ya no se achica sola con el teclado, así que se mide aquí: cuánto
 * de esta vista queda detrás del teclado y se agrega ese espacio. Dentro, un
 * ScrollView se achica y mantiene visible el campo que se está escribiendo.
 */
export function EvitarTeclado({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const vista = useRef<View>(null);
  const [espacio, setEspacio] = useState(0);

  useEffect(() => {
    const mostrar = Keyboard.addListener('keyboardDidShow', (e) => {
      const arribaTeclado = e.endCoordinates.screenY;
      vista.current?.measureInWindow((_x, y, _ancho, alto) => {
        // El espacio va como padding interior: no cambia el tamaño medido de la vista.
        setEspacio(Math.max(Math.round(y + alto - arribaTeclado), 0));
      });
    });
    const ocultar = Keyboard.addListener('keyboardDidHide', () => setEspacio(0));
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, []);

  return (
    <View ref={vista} style={[style, { paddingBottom: espacio }]}>
      {children}
    </View>
  );
}
