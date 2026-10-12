import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Svg, { Circle, G } from 'react-native-svg';

export interface Segmento {
  id: number | string;
  nombre: string;
  color: string;
  valor: number;
}

/**
 * Gráfico de dona (como el de Rial y Money Manager): cada parte con su color
 * y el total en el centro. Debajo, la leyenda con el porcentaje de cada una.
 */
export function Dona({
  segmentos,
  titulo,
  valorCentro,
  formatear,
  tamano = 200,
  grosor = 26,
  leyenda = true,
}: {
  segmentos: Segmento[];
  titulo: string;
  valorCentro: string;
  formatear: (v: number) => string;
  tamano?: number;
  grosor?: number;
  leyenda?: boolean;
}) {
  const tema = useTheme();
  const positivos = segmentos.filter((s) => s.valor > 0);
  const total = positivos.reduce((s, x) => s + x.valor, 0);
  const radio = (tamano - grosor) / 2;
  const circ = 2 * Math.PI * radio;
  // Un pequeño espacio entre partes, salvo que haya una sola.
  const hueco = positivos.length > 1 ? 3 : 0;
  let acumulado = 0;

  return (
    <View style={styles.bloque}>
      <View style={{ width: tamano, height: tamano }}>
        <Svg width={tamano} height={tamano}>
          <G rotation={-90} origin={`${tamano / 2}, ${tamano / 2}`}>
            <Circle cx={tamano / 2} cy={tamano / 2} r={radio} stroke={tema.colors.outlineVariant} strokeWidth={grosor} fill="none" />
            {total > 0 &&
              positivos.map((s) => {
                const largo = (s.valor / total) * circ;
                const offset = -acumulado;
                acumulado += largo;
                return (
                  <Circle
                    key={s.id}
                    cx={tamano / 2}
                    cy={tamano / 2}
                    r={radio}
                    stroke={s.color}
                    strokeWidth={grosor}
                    fill="none"
                    strokeDasharray={`${Math.max(largo - hueco, 0.5)} ${circ}`}
                    strokeDashoffset={offset}
                  />
                );
              })}
          </G>
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.centro]} pointerEvents="none">
          <Text variant="labelMedium" style={{ color: tema.colors.onSurfaceVariant }}>
            {titulo}
          </Text>
          <Text variant="titleMedium" style={styles.valor} numberOfLines={1} adjustsFontSizeToFit>
            {valorCentro}
          </Text>
        </View>
      </View>
      {leyenda && total > 0 && (
        <View style={styles.leyenda}>
          {positivos.map((s) => (
            <View key={s.id} style={styles.fila}>
              <View style={[styles.punto, { backgroundColor: s.color }]} />
              <Text variant="bodyMedium" numberOfLines={1} style={styles.nombre}>
                {s.nombre}
              </Text>
              <Text variant="bodySmall" style={[styles.pct, { color: tema.colors.onSurfaceVariant }]}>
                {`${Math.round((s.valor / total) * 100)}%`}
              </Text>
              <Text variant="bodyMedium" style={styles.cifra}>
                {formatear(s.valor)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: { alignItems: 'center', gap: 16 },
  centro: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  valor: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  leyenda: { alignSelf: 'stretch', gap: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  punto: { width: 12, height: 12, borderRadius: 6 },
  nombre: { flex: 1 },
  pct: { width: 40, textAlign: 'right', fontVariant: ['tabular-nums'] },
  cifra: { minWidth: 90, textAlign: 'right', fontVariant: ['tabular-nums'], fontWeight: '600' },
});
