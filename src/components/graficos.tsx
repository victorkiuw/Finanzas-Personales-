import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Text, useTheme } from 'react-native-paper';

import type { TotalCategoria, TotalMes } from '../db/reportes';
import { formatearMonto, type Moneda } from '../lib/moneda';

/*
 * Gráficos hechos con vistas (sin dependencias nativas). Colores de la paleta
 * categórica validada (contraste y daltonismo) para claro y oscuro:
 * ingresos = aqua, gastos = naranja. Los montos siempre se muestran en texto.
 */
export function coloresSeries(oscuro: boolean) {
  return oscuro ? { ingresos: '#199e70', gastos: '#d95926' } : { ingresos: '#1baf7a', gastos: '#eb6834' };
}

const MAX_CATEGORIAS = 6;

/** Gastos por categoría como barras horizontales ordenadas (parte del total). */
export function BarrasCategorias({ categorias, moneda }: { categorias: TotalCategoria[]; moneda: Moneda }) {
  const tema = useTheme();
  const total = categorias.reduce((s, c) => s + c.total, 0);
  if (total <= 0) {
    return (
      <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
        Sin gastos en este mes.
      </Text>
    );
  }
  // Más de 6 categorías: el resto se agrupa en "Otras" para que la lista siga legible.
  const visibles = categorias.slice(0, MAX_CATEGORIAS);
  const resto = categorias.slice(MAX_CATEGORIAS).reduce((s, c) => s + c.total, 0);
  const filas = resto > 0
    ? [...visibles, { id: -1, nombre: 'Otras', icono: 'dots-horizontal', color: tema.colors.outline, total: resto }]
    : visibles;
  const mayor = filas[0].total;

  return (
    <View style={styles.lista}>
      {filas.map((c) => {
        const porcentaje = Math.round((c.total / total) * 100);
        return (
          <View key={c.id} style={styles.filaCategoria} accessible accessibilityLabel={`${c.nombre}: ${formatearMonto(c.total, moneda)}, ${porcentaje}%`}>
            <Avatar.Icon size={32} icon={c.icono} color="#FFFFFF" style={{ backgroundColor: c.color }} />
            <View style={styles.flex}>
              <View style={styles.filaTextos}>
                <Text variant="bodyMedium" numberOfLines={1} style={styles.flex}>
                  {c.nombre}
                </Text>
                <Text variant="bodyMedium" style={styles.cifra}>
                  {formatearMonto(c.total, moneda)}
                </Text>
                <Text variant="bodySmall" style={[styles.porcentaje, { color: tema.colors.onSurfaceVariant }]}>
                  {`${porcentaje}%`}
                </Text>
              </View>
              <View style={[styles.pista, { backgroundColor: tema.colors.surfaceVariant }]}>
                <View
                  style={[
                    styles.relleno,
                    { width: `${Math.max((c.total / mayor) * 100, 2)}%`, backgroundColor: tema.colors.primary },
                  ]}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const ALTURA_COLUMNAS = 140;

/** Ingresos vs. gastos por mes; tocar un mes muestra sus cifras. */
export function ColumnasMensuales({
  meses,
  etiquetas,
  moneda,
}: {
  meses: TotalMes[];
  /** Etiqueta corta de cada mes, p. ej. "sep". */
  etiquetas: string[];
  moneda: Moneda;
}) {
  const tema = useTheme();
  const colores = coloresSeries(tema.dark);
  const [elegido, setElegido] = useState(meses.length - 1);
  const maximo = Math.max(1, ...meses.flatMap((m) => [m.ingresos, m.gastos]));
  const actual = meses[Math.min(elegido, meses.length - 1)];
  const alto = (v: number) => (v > 0 ? Math.max((v / maximo) * ALTURA_COLUMNAS, 3) : 0);

  return (
    <View>
      <View style={styles.leyenda}>
        <Leyenda color={colores.ingresos} texto="Ingresos" />
        <Leyenda color={colores.gastos} texto="Gastos" />
      </View>

      <View style={[styles.columnas, { borderBottomColor: tema.colors.outlineVariant }]}>
        {meses.map((m, i) => (
          <Pressable
            key={m.mes}
            onPress={() => setElegido(i)}
            style={[styles.mes, i === elegido && { backgroundColor: tema.colors.surfaceVariant }]}
            accessibilityRole="button"
            accessibilityLabel={`${etiquetas[i]}: ingresos ${formatearMonto(m.ingresos, moneda)}, gastos ${formatearMonto(m.gastos, moneda)}`}
          >
            <View style={styles.par}>
              <View style={[styles.columna, { height: alto(m.ingresos), backgroundColor: colores.ingresos }]} />
              <View style={[styles.columna, { height: alto(m.gastos), backgroundColor: colores.gastos }]} />
            </View>
          </Pressable>
        ))}
      </View>
      <View style={styles.etiquetas}>
        {etiquetas.map((e, i) => (
          <Text
            key={e + i}
            variant="labelSmall"
            style={[styles.etiqueta, { color: i === elegido ? tema.colors.onSurface : tema.colors.onSurfaceVariant }]}
          >
            {e}
          </Text>
        ))}
      </View>

      {actual && (
        <View style={styles.detalle}>
          <Text variant="labelLarge">{etiquetas[elegido]}</Text>
          <Text variant="bodyMedium" style={styles.cifra}>{`Ingresos ${formatearMonto(actual.ingresos, moneda)}`}</Text>
          <Text variant="bodyMedium" style={styles.cifra}>{`Gastos ${formatearMonto(actual.gastos, moneda)}`}</Text>
          <Text variant="bodyMedium" style={[styles.cifra, styles.negrita]}>
            {`Balance ${formatearMonto(actual.ingresos - actual.gastos, moneda)}`}
          </Text>
        </View>
      )}
    </View>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <View style={styles.itemLeyenda}>
      <View style={[styles.muestra, { backgroundColor: color }]} />
      <Text variant="bodySmall">{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lista: { gap: 12 },
  filaCategoria: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  filaTextos: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  cifra: { fontVariant: ['tabular-nums'] },
  negrita: { fontWeight: '600' },
  porcentaje: { width: 36, textAlign: 'right', fontVariant: ['tabular-nums'] },
  pista: { height: 8, borderRadius: 4, overflow: 'hidden' },
  relleno: { height: 8, borderRadius: 4 },
  leyenda: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  itemLeyenda: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muestra: { width: 10, height: 10, borderRadius: 2 },
  columnas: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: ALTURA_COLUMNAS + 8,
    borderBottomWidth: 1,
  },
  mes: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', borderRadius: 6 },
  par: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  columna: { width: 12, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  etiquetas: { flexDirection: 'row', marginTop: 4 },
  etiqueta: { flex: 1, textAlign: 'center' },
  detalle: { marginTop: 12, gap: 2 },
});
