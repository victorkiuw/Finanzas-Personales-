import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Svg, { Circle, G, Line, Polyline } from 'react-native-svg';

export interface SerieLinea {
  nombre: string;
  color: string;
  /** Un valor por etiqueta; null = sin dato ese día/mes. */
  valores: (number | null)[];
}

interface Props {
  series: SerieLinea[];
  /** Etiqueta de cada punto del eje X (fecha o mes). */
  etiquetas: string[];
  formatear: (v: number) => string;
  alto?: number;
}

const MARGEN = 8;

/**
 * Gráfico de líneas con SVG. Deslizar el dedo recorre los puntos y muestra los
 * valores de esa fecha arriba (sin él, se muestran los del último punto).
 */
export function GraficoLineas({ series, etiquetas, formatear, alto = 160 }: Props) {
  const tema = useTheme();
  const [ancho, setAncho] = useState(0);
  const [indice, setIndice] = useState<number | null>(null);
  const n = etiquetas.length;
  const todos = series.flatMap((s) => s.valores.filter((v): v is number => v !== null));
  if (n < 2 || todos.length === 0) {
    return (
      <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
        Aún no hay datos suficientes para el gráfico.
      </Text>
    );
  }
  let min = Math.min(...todos);
  let max = Math.max(...todos);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const x = (i: number) => MARGEN + (i / (n - 1)) * (ancho - 2 * MARGEN);
  const y = (v: number) => MARGEN + (1 - (v - min) / (max - min)) * (alto - 2 * MARGEN);
  const activo = indice ?? n - 1;

  const recorrer = (e: GestureResponderEvent) => {
    if (ancho <= 0) return;
    const i = Math.round(((e.nativeEvent.locationX - MARGEN) / (ancho - 2 * MARGEN)) * (n - 1));
    setIndice(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <View>
      <View style={styles.cabecera}>
        <Text variant="labelLarge">{etiquetas[activo]}</Text>
        {series.map((s) => {
          const v = s.valores[activo];
          return (
            <View key={s.nombre} style={styles.leyenda}>
              <View style={[styles.muestra, { backgroundColor: s.color }]} />
              <Text variant="bodySmall">{`${s.nombre}: `}</Text>
              <Text variant="bodySmall" style={styles.cifra}>
                {v === null ? '—' : formatear(v)}
              </Text>
            </View>
          );
        })}
      </View>
      <View
        style={{ height: alto }}
        onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={recorrer}
        onResponderMove={recorrer}
        onResponderRelease={() => setIndice(null)}
        // Si el gesto es vertical, el scroll de la pantalla se lo lleva.
        onResponderTerminationRequest={() => true}
        onResponderTerminate={() => setIndice(null)}
        accessible
        accessibilityLabel={series
          .map((s) => `${s.nombre}: ${s.valores[n - 1] === null ? 'sin dato' : formatear(s.valores[n - 1]!)}`)
          .join(', ')}
      >
        {ancho > 0 && (
          <Svg width={ancho} height={alto}>
            <Line x1={MARGEN} y1={alto - MARGEN} x2={ancho - MARGEN} y2={alto - MARGEN} stroke={tema.colors.outlineVariant} strokeWidth={1} />
            <Line x1={x(activo)} y1={MARGEN} x2={x(activo)} y2={alto - MARGEN} stroke={tema.colors.outline} strokeWidth={1} strokeDasharray="3,3" />
            {series.map((s) => {
              const puntos = s.valores
                .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
                .filter(Boolean)
                .join(' ');
              const v = s.valores[activo];
              return (
                <G key={s.nombre}>
                  <Polyline points={puntos} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {v !== null && (
                    <Circle cx={x(activo)} cy={y(v)} r={4} fill={s.color} stroke={tema.colors.surface} strokeWidth={2} />
                  )}
                </G>
              );
            })}
          </Svg>
        )}
      </View>
      <View style={styles.eje}>
        <Text variant="labelSmall" style={{ color: tema.colors.onSurfaceVariant }}>
          {etiquetas[0]}
        </Text>
        <Text variant="labelSmall" style={{ color: tema.colors.onSurfaceVariant }}>
          {etiquetas[n - 1]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cabecera: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 2, marginBottom: 6 },
  leyenda: { flexDirection: 'row', alignItems: 'center' },
  muestra: { width: 10, height: 3, borderRadius: 2, marginRight: 4 },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  eje: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
});
