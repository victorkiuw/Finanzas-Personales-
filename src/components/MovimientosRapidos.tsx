import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, StyleSheet, View } from 'react-native';
import { Chip, Text, useTheme } from 'react-native-paper';

import { eliminarPlantilla, usarPlantilla, type Plantilla } from '../db/plantillas';
import { formatearMonto } from '../lib/moneda';

/**
 * Botones de Inicio para registrar gastos frecuentes con un toque. Con monto
 * guardado piden confirmación y lo registran; sin monto abren el formulario lleno.
 */
export function MovimientosRapidos({ plantillas, onCambio }: { plantillas: Plantilla[]; onCambio: () => void }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  if (plantillas.length === 0) return null;

  const usar = (p: Plantilla) => {
    if (!p.monto) {
      router.push({
        pathname: '/movimiento/nuevo',
        params: { tipo: p.tipo, billetera: String(p.billetera_id), categoria: String(p.categoria_id), nota: p.nombre },
      });
      return;
    }
    Alert.alert(p.nombre, `Registrar ${p.tipo === 'GASTO' ? 'gasto' : 'ingreso'} de ${formatearMonto(p.monto, p.billetera_moneda)} en ${p.billetera_nombre}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Otro monto',
        onPress: () =>
          router.push({
            pathname: '/movimiento/nuevo',
            params: { tipo: p.tipo, billetera: String(p.billetera_id), categoria: String(p.categoria_id), nota: p.nombre },
          }),
      },
      {
        text: 'Registrar',
        onPress: () =>
          usarPlantilla(db, p)
            .then(onCambio)
            .catch((e) => Alert.alert('Error', String(e))),
      },
    ]);
  };

  const borrar = (p: Plantilla) =>
    Alert.alert('¿Quitar este movimiento rápido?', p.nombre, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => eliminarPlantilla(db, p.id).then(onCambio) },
    ]);

  return (
    <View style={styles.bloque}>
      <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
        Movimientos rápidos
      </Text>
      <View style={styles.chips}>
        {plantillas.map((p) => (
          <Chip key={p.id} icon={p.icono} mode="outlined" onPress={() => usar(p)} onLongPress={() => borrar(p)}>
            {p.monto ? `${p.nombre} · ${formatearMonto(p.monto, p.billetera_moneda)}` : p.nombre}
          </Chip>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: { gap: 8, marginHorizontal: 16, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
