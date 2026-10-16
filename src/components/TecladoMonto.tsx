import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { centimosATexto, parsearMonto } from '../lib/moneda';
import { vibrar } from '../lib/vibrar';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];
const SUMAS = [1, 5, 10, 100];

/**
 * Teclado numérico de la app para escribir montos: grande, con coma decimal y
 * botones para sumar rápido (+1, +5, +10, +100). No tapa el formulario como
 * el teclado de Android.
 */
export function TecladoMonto({
  texto,
  onCambio,
  onListo,
  color,
}: {
  texto: string;
  onCambio: (texto: string) => void;
  onListo: () => void;
  /** Color del botón Listo (el del tipo de movimiento). */
  color?: string;
}) {
  const tema = useTheme();

  const tocar = (tecla: string) => {
    vibrar('suave');
    if (tecla === '⌫') return onCambio(texto.slice(0, -1));
    if (tecla === ',') {
      if (texto.includes(',')) return;
      return onCambio(`${texto || '0'},`);
    }
    // Máximo dos decimales.
    const [, dec] = texto.split(',');
    if (dec !== undefined && dec.length >= 2) return;
    onCambio(texto === '0' ? tecla : texto + tecla);
  };

  const sumar = (n: number) => {
    vibrar('suave');
    const actual = parsearMonto(texto) ?? 0;
    onCambio(centimosATexto(actual + n * 100));
  };

  return (
    <View style={[styles.caja, { backgroundColor: tema.colors.surfaceVariant }]}>
      <View style={styles.sumas}>
        {SUMAS.map((n) => (
          <Pressable
            key={n}
            onPress={() => sumar(n)}
            style={({ pressed }) => [styles.suma, { backgroundColor: tema.colors.secondaryContainer, opacity: pressed ? 0.7 : 1 }]}
            accessibilityLabel={`Sumar ${n}`}
          >
            <Text variant="labelLarge" style={{ color: tema.colors.onSecondaryContainer }}>{`+${n}`}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            vibrar('suave');
            onCambio('');
          }}
          style={({ pressed }) => [styles.suma, { backgroundColor: tema.colors.outlineVariant, opacity: pressed ? 0.7 : 1 }]}
          accessibilityLabel="Borrar todo"
        >
          <Text variant="labelLarge">C</Text>
        </Pressable>
      </View>
      <View style={styles.rejilla}>
        {TECLAS.map((t) => (
          <Pressable
            key={t}
            onPress={() => tocar(t)}
            onLongPress={t === '⌫' ? () => onCambio('') : undefined}
            style={({ pressed }) => [styles.tecla, { backgroundColor: pressed ? tema.colors.outlineVariant : 'transparent' }]}
            accessibilityLabel={t === '⌫' ? 'Borrar' : t}
          >
            {t === '⌫' ? (
              <Icon source="backspace-outline" size={26} color={tema.colors.onSurface} />
            ) : (
              <Text variant="headlineSmall" style={styles.digito}>
                {t}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={onListo}
        style={({ pressed }) => [styles.listo, { backgroundColor: color ?? tema.colors.primary, opacity: pressed ? 0.8 : 1 }]}
        accessibilityRole="button"
      >
        <Text variant="titleMedium" style={styles.textoListo}>
          Listo
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderRadius: 24, padding: 10, gap: 8, marginTop: 8 },
  sumas: { flexDirection: 'row', gap: 6 },
  suma: { flex: 1, borderRadius: 999, paddingVertical: 8, alignItems: 'center' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap' },
  tecla: { width: '33.33%', height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  digito: { fontWeight: '600' },
  listo: { borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  textoListo: { color: '#FFFFFF', fontWeight: '700' },
});
