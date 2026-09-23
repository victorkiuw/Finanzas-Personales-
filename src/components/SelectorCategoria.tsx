import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

import type { Categoria } from '../db/categorias';

/** Chips de categorías; la elegida toma su color. */
export function SelectorCategoria({
  categorias,
  valor,
  onCambio,
}: {
  categorias: Categoria[];
  valor: number | null;
  onCambio: (id: number) => void;
}) {
  return (
    <View style={styles.chips}>
      {categorias.map((c) => {
        const elegida = c.id === valor;
        return (
          <Chip
            key={c.id}
            icon={c.icono}
            compact
            selected={elegida}
            showSelectedCheck={false}
            mode={elegida ? 'flat' : 'outlined'}
            onPress={() => onCambio(c.id)}
            style={elegida ? { backgroundColor: c.color_hex } : undefined}
            textStyle={elegida ? styles.textoElegido : undefined}
            selectedColor={elegida ? '#FFFFFF' : undefined}
          >
            {c.nombre}
          </Chip>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  textoElegido: { color: '#FFFFFF' },
});
