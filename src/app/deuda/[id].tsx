import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';

import { DialogoPagoDeuda } from '../../components/DialogoPagoDeuda';
import { ListaMovimientos } from '../../components/ListaMovimientos';
import { ResumenDeuda, vencida } from '../../components/TarjetaDeuda';
import { useTasas } from '../../components/TasasProvider';
import { eliminarDeuda, establecerDeudaCerrada, obtenerDeuda, type Deuda } from '../../db/deudas';
import { fechaSimpleLegible } from '../../lib/fechas';

export default function DetalleDeuda() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deudaId = Number(id);
  const db = useSQLiteContext();
  const tema = useTheme();
  const { tasas, referencia } = useTasas();
  const [deuda, setDeuda] = useState<Deuda | null>(null);
  const [pagando, setPagando] = useState(false);
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
    await establecerDeudaCerrada(db, deuda.id, !deuda.cerrada);
    cargar();
  };

  const confirmarEliminar = () => {
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
                  <ResumenDeuda deuda={deuda} tasas={tasas} referencia={referencia} detalle />
                  {deuda.fecha_limite && !deuda.cerrada && (
                    <Text variant="bodySmall" style={{ color: vencida(deuda) ? tema.colors.error : tema.colors.onSurfaceVariant }}>
                      {`${vencida(deuda) ? 'Venció' : 'Debe pagarse antes del'} ${fechaSimpleLegible(deuda.fecha_limite)}`}
                    </Text>
                  )}
                  {deuda.nota && <Text variant="bodyMedium">{deuda.nota}</Text>}
                  {deuda.cerrada && (
                    <Text variant="labelLarge" style={{ color: tema.colors.primary }}>
                      ✓ Saldada
                    </Text>
                  )}
                  {/* Acciones a la vista, sin menú escondido. */}
                  <View style={styles.acciones}>
                    <Button compact mode="contained-tonal" icon="pencil" onPress={() => router.push(`/deuda/editar/${deudaId}`)}>
                      Editar
                    </Button>
                    <Button compact mode="outlined" icon={deuda.cerrada ? 'lock-open-variant' : 'check-circle'} onPress={alternarCerrada}>
                      {deuda.cerrada ? 'Reabrir' : 'Saldada'}
                    </Button>
                    <Button compact mode="text" icon="delete" textColor={tema.colors.error} onPress={confirmarEliminar}>
                      Eliminar
                    </Button>
                  </View>
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
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  boton: { marginHorizontal: 16, marginBottom: 8 },
});
