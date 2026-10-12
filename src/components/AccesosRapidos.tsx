import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { coloresExtra } from '../lib/tema';

export interface Acceso {
  icono: string;
  texto: string;
  onPress: () => void;
}

/** Fila de botones redondos con su nombre debajo (como los accesos de Rial). */
export function AccesosRapidos({ accesos }: { accesos: Acceso[] }) {
  const tema = useTheme();
  const extra = coloresExtra(tema);
  return (
    <View style={styles.fila}>
      {accesos.map((a) => (
        <Pressable key={a.texto} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.texto} style={styles.acceso}>
          {({ pressed }) => (
            <>
              <View
                style={[
                  styles.circulo,
                  { backgroundColor: extra.redondo, borderColor: tema.colors.outlineVariant, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Icon source={a.icono} size={26} color={tema.colors.onSurface} />
              </View>
              <Text variant="labelMedium" numberOfLines={1} style={styles.texto}>
                {a.texto}
              </Text>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8 },
  acceso: { alignItems: 'center', gap: 6, flex: 1 },
  circulo: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  texto: { textAlign: 'center' },
});
