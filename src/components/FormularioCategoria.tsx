import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Avatar, Button, HelperText, IconButton, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';

import { ErrorValidacion } from '../db/billeteras';
import {
  actualizarCategoria,
  contarUsosCategoria,
  crearCategoria,
  eliminarCategoria,
  establecerCategoriaArchivada,
  LARGO_MAXIMO_NOMBRE_CATEGORIA,
  obtenerCategoria,
  type Categoria,
  type TipoCategoria,
} from '../db/categorias';
import { COLORES_CATEGORIA, ICONOS_CATEGORIA } from '../lib/tema';

interface Props {
  id?: number;
  tipoInicial?: TipoCategoria;
}

export function FormularioCategoria({ id, tipoInicial = 'GASTO' }: Props) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const editando = id !== undefined;
  const [original, setOriginal] = useState<Categoria | null>(null);
  const [usos, setUsos] = useState(0);
  const [cargando, setCargando] = useState(editando);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoCategoria>(tipoInicial);
  const [icono, setIcono] = useState<string>('tag');
  const [color, setColor] = useState<string>(COLORES_CATEGORIA[0]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (id === undefined) return;
    (async () => {
      const c = await obtenerCategoria(db, id);
      if (!c) {
        router.back();
        return;
      }
      setOriginal(c);
      setNombre(c.nombre);
      setTipo(c.tipo);
      setIcono(c.icono);
      setColor(c.color_hex);
      setUsos(await contarUsosCategoria(db, id));
      setCargando(false);
    })().catch((e) => Alert.alert('Error', String(e)));
  }, [db, id]);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const datos = { nombre, tipo, icono, color_hex: color };
    try {
      if (id === undefined) await crearCategoria(db, datos);
      else await actualizarCategoria(db, id, datos);
      router.back();
    } catch (e) {
      if (e instanceof ErrorValidacion) setError(e.message);
      else Alert.alert('Error', String(e));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = () => {
    if (id === undefined) return;
    Alert.alert(
      '¿Eliminar categoría?',
      usos > 0
        ? `Tiene ${usos} movimiento(s): se archivará para conservar tu historial y dejará de aparecer al registrar.`
        : 'Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: usos > 0 ? 'Archivar' : 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await eliminarCategoria(db, id);
            router.back();
          },
        },
      ],
    );
  };

  if (cargando) return <ActivityIndicator style={styles.cargando} />;

  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: editando ? 'Editar categoría' : 'Nueva categoría' }} />

      <View style={styles.vistaPrevia}>
        <Avatar.Icon size={56} icon={icono} color="#FFFFFF" style={{ backgroundColor: color }} />
        <Text variant="titleMedium">{nombre.trim() || 'Nombre de la categoría'}</Text>
      </View>

      <TextInput
        label="Nombre"
        value={nombre}
        onChangeText={setNombre}
        maxLength={LARGO_MAXIMO_NOMBRE_CATEGORIA}
        mode="outlined"
        autoFocus={!editando}
      />

      <View>
        <SegmentedButtons
          value={tipo}
          onValueChange={(v) => setTipo(v as TipoCategoria)}
          buttons={[
            { value: 'GASTO', label: 'Gasto', icon: 'arrow-up', disabled: usos > 0 && tipo !== 'GASTO' },
            { value: 'INGRESO', label: 'Ingreso', icon: 'arrow-down', disabled: usos > 0 && tipo !== 'INGRESO' },
          ]}
        />
        {usos > 0 && <HelperText type="info">{`Usada en ${usos} movimiento(s): el tipo no se puede cambiar.`}</HelperText>}
      </View>

      <View>
        <Text variant="labelLarge" style={styles.etiqueta}>
          Icono
        </Text>
        <View style={styles.rejilla}>
          {ICONOS_CATEGORIA.map((i) => (
            <IconButton
              key={i}
              icon={i}
              size={22}
              mode={icono === i ? 'contained' : undefined}
              selected={icono === i}
              onPress={() => setIcono(i)}
              accessibilityLabel={`Icono ${i}`}
            />
          ))}
        </View>
      </View>

      <View>
        <Text variant="labelLarge" style={styles.etiqueta}>
          Color
        </Text>
        <View style={styles.rejilla}>
          {COLORES_CATEGORIA.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              accessibilityRole="radio"
              accessibilityState={{ selected: color === c }}
              accessibilityLabel={`Color ${c}`}
              style={[styles.color, { backgroundColor: c }, color === c && { borderColor: tema.colors.onSurface }]}
            />
          ))}
        </View>
      </View>

      {error && <HelperText type="error">{error}</HelperText>}
      <Button mode="contained" onPress={guardar} loading={guardando} disabled={guardando}>
        Guardar
      </Button>

      {editando && original && (
        <View style={styles.acciones}>
          {original.archivada ? (
            <Button
              mode="outlined"
              icon="archive-arrow-up"
              onPress={async () => {
                await establecerCategoriaArchivada(db, original.id, false);
                router.back();
              }}
            >
              Restaurar
            </Button>
          ) : (
            <View />
          )}
          <Button mode="text" icon="delete" textColor={tema.colors.error} onPress={confirmarEliminar}>
            Eliminar
          </Button>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cargando: { marginTop: 48 },
  contenido: { padding: 16, gap: 16, paddingBottom: 48 },
  vistaPrevia: { alignItems: 'center', gap: 8 },
  etiqueta: { marginBottom: 8 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  color: { width: 36, height: 36, borderRadius: 18, borderColor: 'transparent', borderWidth: 3, margin: 2 },
  acciones: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
});
