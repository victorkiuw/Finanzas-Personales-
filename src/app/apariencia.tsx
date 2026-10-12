import { Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, SegmentedButtons, Text, useTheme } from 'react-native-paper';

import { useApariencia, type ModoTema } from '../components/TemaApp';
import { coloresExtra, ACENTOS, mezclar, type Acento } from '../lib/tema';
import { vibrar } from '../lib/vibrar';

/** Elegir tema claro, oscuro o el del teléfono, y el color de acento. */
export default function Apariencia() {
  const tema = useTheme();
  const extra = coloresExtra(tema);
  const { modo, acento, cambiarModo, cambiarAcento } = useApariencia();

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: 'Apariencia' }} />

      <Text variant="titleMedium">Tema</Text>
      <SegmentedButtons
        value={modo}
        onValueChange={(v) => {
          vibrar('suave');
          cambiarModo(v as ModoTema);
        }}
        buttons={[
          { value: 'auto', label: 'Automático', icon: 'theme-light-dark' },
          { value: 'claro', label: 'Claro', icon: 'white-balance-sunny' },
          { value: 'oscuro', label: 'Oscuro', icon: 'weather-night' },
        ]}
      />
      <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
        Automático usa el mismo tema que tenga el teléfono.
      </Text>

      <Text variant="titleMedium" style={styles.titulo}>
        Color de acento
      </Text>
      <View style={styles.colores}>
        {(Object.keys(ACENTOS) as Acento[]).map((a) => {
          const elegido = a === acento;
          const color = ACENTOS[a].vivo;
          return (
            <Pressable
              key={a}
              onPress={() => {
                vibrar('suave');
                cambiarAcento(a);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: elegido }}
              accessibilityLabel={ACENTOS[a].nombre}
              style={styles.opcion}
            >
              <View
                style={[
                  styles.circulo,
                  { backgroundColor: color, borderColor: elegido ? tema.colors.onSurface : 'transparent' },
                ]}
              >
                {elegido && <Icon source="check" size={26} color={mezclar(color, '#000000', 0.88)} />}
              </View>
              <Text variant="labelMedium" style={{ fontWeight: elegido ? '700' : '400' }}>
                {ACENTOS[a].nombre}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text variant="titleMedium" style={styles.titulo}>
        Vista previa
      </Text>
      <View style={[styles.muestra, { backgroundColor: extra.heroe }]}>
        <Text variant="titleSmall" style={{ color: extra.heroeTexto, opacity: 0.75 }}>
          Disponible
        </Text>
        <Text variant="headlineMedium" style={{ color: extra.heroeTexto, fontWeight: '800' }}>
          $ 1.234,56
        </Text>
        <View style={[styles.boton, { backgroundColor: tema.colors.primaryContainer }]}>
          <Text variant="labelLarge" style={{ color: tema.colors.onPrimaryContainer, fontWeight: '700' }}>
            Elegido
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  titulo: { marginTop: 12 },
  colores: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  opcion: { alignItems: 'center', gap: 6, width: 72 },
  circulo: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  muestra: { borderRadius: 28, padding: 20, alignItems: 'center', gap: 8 },
  boton: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8, marginTop: 4 },
});
