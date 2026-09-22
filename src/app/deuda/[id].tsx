import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Card, IconButton, Menu, Text, useTheme } from 'react-native-paper';

import { DialogoPagoDeuda } from '../../components/DialogoPagoDeuda';
import { ListaMovimientos } from '../../components/ListaMovimientos';
import { ResumenDeuda, vencida } from '../../components/TarjetaDeuda';
import { useTasas } from '../../components/TasasProvider';
import { eliminarDeuda, establecerDeudaCerrada, obtenerDeuda, type Deuda } from '../../db/deudas';
import { fechaSimpleLegible, formatearFechaCorta } from '../../lib/fechas';

export default function DetalleDeuda() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deudaId = Number(id);
  const db = useSQLiteContext();
  const tema = useTheme();
  const { tasas } = useTasas();
  const [deuda, setDeuda] = useState<Deuda | null>(null);
  const [pagando, setPagando] = useState(false);
  const [menu, setMenu] = useState(false);
  // Fuerza a la lista a recargar tras un pago (la pantalla no pierde el foco).
  const [version, setVersion] = useState(0);

  const cargar = useCallback(() => {
    obtenerDeuda(db, deudaId)
      .then((d) => (d ? setDeuda(d) : router.back()))
      .catch((e) => Alert.alert('Error', String(e)));
  }, [db, deudaId]);

  useFocusEffect(cargar);

  const alternarCerrada = async () => {
    if (!deuda) return;
    setMenu(false);
    await establecerDeudaCerrada(db, deuda.id, !deuda.cerrada);
    cargar();
  };

  const confirmarEliminar = () => {
    setMenu(false);
    Alert.alert(
      '¿Eliminar deuda?',
      'Se borrarán también el préstamo y los pagos registrados, y los saldos de tus billeteras se recalcularán.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await eliminarDeuda(db, deudaId);
            router.back();
          },
        },
      ],
    );
  };

  const meDeben = deuda?.tipo === 'ME_DEBEN';

  return (
    <>
      <Stack.Screen
        options={{
          title: deuda ? (meDeben ? `${deuda.persona} me debe` : `Le debo a ${deuda.persona}`) : '',
          headerRight: () => (
            <Menu
              visible={menu}
              onDismiss={() => setMenu(false)}
              anchor={<IconButton icon="dots-vertical" accessibilityLabel="Opciones" onPress={() => setMenu(true)} />}
            >
              <Menu.Item
                leadingIcon="pencil"
                title="Editar"
                onPress={() => {
                  setMenu(false);
                  router.push(`/deuda/editar/${deudaId}`);
                }}
              />
              <Menu.Item
                leadingIcon={deuda?.cerrada ? 'lock-open-variant' : 'check-circle'}
                title={deuda?.cerrada ? 'Reabrir' : 'Marcar como saldada'}
                onPress={alternarCerrada}
              />
              <Menu.Item leadingIcon="delete" title="Eliminar" onPress={confirmarEliminar} />
            </Menu>
          ),
        }}
      />
      <ListaMovimientos
        key={version}
        filtro={{ deudaId }}
        textoVacio="Sin movimientos: esta deuda se registró sin mover saldos."
        encabezado={
          deuda ? (
            <View>
              <Card mode="contained" style={styles.tarjeta}>
                <Card.Content style={styles.contenido}>
                  <ResumenDeuda deuda={deuda} tasas={tasas} />
                  <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                    {`Desde el ${formatearFechaCorta(new Date(deuda.fecha))}`}
                    {deuda.fecha_limite ? ` · ${vencida(deuda) ? 'venció' : 'vence'} el ${fechaSimpleLegible(deuda.fecha_limite)}` : ''}
                  </Text>
                  {deuda.nota && <Text variant="bodyMedium">{deuda.nota}</Text>}
                  {deuda.cerrada && (
                    <Text variant="labelLarge" style={{ color: tema.colors.primary }}>
                      ✓ Saldada
                    </Text>
                  )}
                </Card.Content>
              </Card>
              {!deuda.cerrada && (
                <Button mode="contained" icon="cash-plus" style={styles.boton} onPress={() => setPagando(true)}>
                  {meDeben ? 'Registrar cobro' : 'Registrar pago'}
                </Button>
              )}
            </View>
          ) : undefined
        }
      />
      {deuda && (
        <DialogoPagoDeuda
          deuda={deuda}
          visible={pagando}
          onCerrar={(guardado) => {
            setPagando(false);
            if (guardado) {
              cargar();
              setVersion((v) => v + 1);
            }
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  tarjeta: { margin: 16, marginBottom: 8 },
  contenido: { gap: 8 },
  boton: { marginHorizontal: 16, marginBottom: 8 },
});
