import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Avatar, Button, Dialog, HelperText, List, Portal, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';

import { ErrorValidacion } from '../db/billeteras';
import { listarCategorias, type Categoria } from '../db/categorias';
import { eliminarPresupuesto, guardarPresupuesto, listarPresupuestos, type Presupuesto } from '../db/presupuestos';
import { centimosATexto, formatearMonto, INFO_MONEDA, parsearMonto, type Moneda } from '../lib/moneda';

export default function PantallaPresupuestos() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [montoTexto, setMontoTexto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [c, p] = await Promise.all([listarCategorias(db, 'GASTO'), listarPresupuestos(db)]);
    setCategorias(c);
    setPresupuestos(p);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch((e) => Alert.alert('Error', String(e)));
    }, [cargar]),
  );

  const abrir = (c: Categoria) => {
    const p = presupuestos.find((x) => x.categoria_id === c.id);
    setMontoTexto(p ? centimosATexto(p.monto) : '');
    setMoneda(p?.moneda ?? 'USD');
    setError(null);
    setEditando(c);
  };

  const guardar = async () => {
    const monto = parsearMonto(montoTexto);
    if (!editando || !monto || monto <= 0) {
      setError('Escribe un monto mayor que cero.');
      return;
    }
    try {
      await guardarPresupuesto(db, { categoria_id: editando.id, monto, moneda });
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof ErrorValidacion ? e.message : String(e));
    }
  };

  const quitar = async () => {
    if (!editando) return;
    await eliminarPresupuesto(db, editando.id);
    setEditando(null);
    await cargar();
  };

  const conPresupuesto = new Map(presupuestos.map((p) => [p.categoria_id, p]));

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Presupuestos mensuales' }} />
      <FlatList
        data={categorias}
        keyExtractor={(c) => String(c.id)}
        ListHeaderComponent={
          <Text variant="bodyMedium" style={[styles.ayuda, { color: tema.colors.onSurfaceVariant }]}>
            Pon un límite de gasto al mes por categoría. En Inicio verás cuánto llevas, con aviso al 80 % y al
            pasarte. Los gastos en otra moneda se convierten con la tasa de su día.
          </Text>
        }
        renderItem={({ item }) => {
          const p = conPresupuesto.get(item.id);
          return (
            <List.Item
              title={item.nombre}
              description={p ? `${formatearMonto(p.monto, p.moneda)} al mes` : 'Sin presupuesto'}
              onPress={() => abrir(item)}
              left={() => (
                <Avatar.Icon size={36} icon={item.icono} color="#FFFFFF" style={[styles.icono, { backgroundColor: item.color_hex }]} />
              )}
              right={(pr) => <List.Icon {...pr} icon={p ? 'pencil' : 'plus'} />}
            />
          );
        }}
      />
      <Portal>
        <Dialog visible={editando !== null} onDismiss={() => setEditando(null)}>
          <Dialog.Title>{editando ? `Presupuesto de ${editando.nombre}` : ''}</Dialog.Title>
          <Dialog.Content style={styles.dialogo}>
            <SegmentedButtons
              value={moneda}
              onValueChange={(v) => setMoneda(v as Moneda)}
              buttons={(['USD', 'BS'] as Moneda[]).map((m) => ({ value: m, label: INFO_MONEDA[m].corto }))}
            />
            <TextInput
              label="Máximo al mes"
              value={montoTexto}
              onChangeText={setMontoTexto}
              keyboardType="decimal-pad"
              mode="outlined"
              autoFocus
              right={<TextInput.Affix text={INFO_MONEDA[moneda].corto} />}
            />
            {error && <HelperText type="error">{error}</HelperText>}
          </Dialog.Content>
          <Dialog.Actions>
            {editando && conPresupuesto.has(editando.id) && (
              <Button textColor={tema.colors.error} onPress={quitar}>
                Quitar
              </Button>
            )}
            <Button onPress={() => setEditando(null)}>Cancelar</Button>
            <Button onPress={guardar}>Guardar</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  ayuda: { padding: 16 },
  icono: { marginLeft: 16 },
  dialogo: { gap: 12 },
});
