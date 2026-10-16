import { useSQLiteContext } from 'expo-sqlite';
import { StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';

import { guardarOrdenCategorias, type Categoria } from '../db/categorias';
import { Reordenable } from './Reordenable';

/** Chips de categorías; la elegida toma su color. Dejándolas presionadas se cambian de lugar. */
export function SelectorCategoria({
  categorias,
  valor,
  onCambio,
  onArrastre,
}: {
  categorias: Categoria[];
  valor: number | null;
  onCambio: (id: number) => void;
  onArrastre?: (activo: boolean) => void;
}) {
  const db = useSQLiteContext();
  return (
    <Reordenable
      items={categorias}
      clave={(c) => c.id}
      estilo={styles.chips}
      onArrastre={onArrastre}
      onReordenar={(nuevas) => guardarOrdenCategorias(db, nuevas.map((c) => c.id)).catch(() => {})}
      render={(c, levantado) => {
        const elegida = c.id === valor;
        return (
          <Chip
            icon={c.icono}
            compact
            selected={elegida}
            showSelectedCheck={false}
            mode={elegida || levantado ? 'flat' : 'outlined'}
            onPress={() => onCambio(c.id)}
            onLongPress={() => {}}
            delayLongPress={380}
            style={elegida ? { backgroundColor: c.color_hex } : undefined}
            textStyle={elegida ? styles.textoElegido : undefined}
            selectedColor={elegida ? '#FFFFFF' : undefined}
          >
            {c.nombre}
          </Chip>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  textoElegido: { color: '#FFFFFF' },
});
