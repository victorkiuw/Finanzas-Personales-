import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

import type { Billetera } from '../db/billeteras';
import { INFO_MONEDA } from '../lib/moneda';

interface Props {
  billeteras: Billetera[];
  valor: number | null;
  onCambio: (id: number) => void;
  /** Billetera que no se puede elegir (p. ej. el origen al elegir destino). */
  excluir?: number | null;
}

export function SelectorBilletera({ billeteras, valor, onCambio, excluir }: Props) {
  return (
    // Las billeteras se reparten en varias líneas: se ven todas sin deslizar, también en diálogos angostos.
    <View style={styles.fila}>
      {billeteras
        .filter((b) => b.id !== excluir)
        .map((b) => {
          const elegida = b.id === valor;
          return (
            <Chip
              key={b.id}
              icon={b.icono}
              compact
              selected={elegida}
              showSelectedCheck={false}
              mode={elegida ? 'flat' : 'outlined'}
              onPress={() => onCambio(b.id)}
              style={elegida ? { backgroundColor: b.color_hex } : undefined}
              textStyle={elegida ? styles.textoElegido : undefined}
              selectedColor={elegida ? '#FFFFFF' : undefined}
            >
              {`${b.nombre} · ${INFO_MONEDA[b.moneda].corto}`}
            </Chip>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
  textoElegido: { color: '#FFFFFF' },
});
