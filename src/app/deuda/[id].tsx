import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';

import { DialogoEntradaAjeno } from '../../components/DialogoEntradaAjeno';
import { DialogoPagoDeuda } from '../../components/DialogoPagoDeuda';
import { DialogoTomarPrestado } from '../../components/DialogoTomarPrestado';
import { ListaMovimientos } from '../../components/ListaMovimientos';
import { ResumenDeuda, vencida } from '../../components/TarjetaDeuda';
import { useTasas } from '../../components/TasasProvider';
import {
  eliminarDeuda,
  establecerDeudaCerrada,
  listarAjustes,
  listarDeudas,
  obtenerDeuda,
  type AjusteDeuda,
  type Deuda,
} from '../../db/deudas';
import { cambioDe } from '../../db/tasas';
import { NOMBRE_PAR } from '../../lib/api-tasas';
import { convertir } from '../../lib/conversion';
import { fechaSimpleLegible, formatearFechaCorta } from '../../lib/fechas';
import { formatearMonto } from '../../lib/moneda';

export default function DetalleDeuda() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deudaId = Number(id);
  const db = useSQLiteContext();
  const tema = useTheme();
  const { tasas, referencia } = useTasas();
  const [deuda, setDeuda] = useState<Deuda | null>(null);
  const [pagando, setPagando] = useState(false);
  const [tomando, setTomando] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [ajustes, setAjustes] = useState<AjusteDeuda[]>([]);
  // Si es dinero ajeno, lo que se ha tomado prestado de él y sigue pendiente.
  const [tomadas, setTomadas] = useState<Deuda[]>([]);
  // Fuerza a la lista a recargar tras un pago (la pantalla no pierde el foco).
  const [version, setVersion] = useState(0);

  const cargar = useCallback(() => {
    Promise.all([obtenerDeuda(db, deudaId), listarAjustes(db, deudaId), listarDeudas(db, { incluirCerradas: false })])
      .then(([d, a, todas]) => {
        if (!d) {
          router.back();
          return;
        }
        setDeuda(d);
        setAjustes(a);
        setTomadas(todas.filter((x) => x.origen_ajeno_id === d.id));
      })
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
      deuda?.ajeno
        ? 'Se borrará su dinero y lo que entró y salió de él (los saldos se recalculan); lo que tomaste prestado queda como una deuda normal.'
        : 'Se borrarán también el préstamo y los pagos registrados, y los saldos de tus billeteras se recalcularán.',
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

  /** Abre WhatsApp con un mensaje amable y el monto de hoy, para elegir a quién enviarlo. */
  const recordarPorWhatsApp = () => {
    if (!deuda) return;
    const bs = deuda.moneda === 'BS' && deuda.unidad !== 'BS' ? convertir(deuda.pendiente, deuda.unidad, 'BS', cambioDe(tasas, referencia)) : null;
    const monto = bs !== null
      ? `${formatearMonto(bs, 'BS')} (${formatearMonto(deuda.pendiente, deuda.unidad)} a tasa ${NOMBRE_PAR[referencia]} de hoy)`
      : formatearMonto(deuda.pendiente, deuda.unidad);
    const texto = `Hola ${deuda.persona}, te escribo para recordarte lo que quedó pendiente: hoy son ${monto}. ¡Gracias!`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(texto)}`).catch(() =>
      Alert.alert('WhatsApp', 'No se pudo abrir WhatsApp.'),
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: deuda
            ? deuda.ajeno
              ? `Dinero de ${deuda.persona}`
              : meDeben
                ? `${deuda.persona} me debe`
                : `Le debo a ${deuda.persona}`
            : '',
        }}
      />
      <ListaMovimientos
        key={version}
        filtro={{ deudaId }}
        textoVacio={
          deuda?.ajeno
            ? 'Sin movimientos: aquí verás lo que le entra y le sale.'
            : deuda?.origen_ajeno_id
            ? 'Sin movimientos en tus billeteras.'
            : 'Sin movimientos: esta deuda se registró sin mover saldos.'
        }
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
                      {deuda.ajeno ? 'Ahora no tienes nada suyo.' : '✓ Saldada'}
                    </Text>
                  )}
                  {tomadas.map((t) => (
                    <Button key={t.id} mode="text" icon="hand-coin" style={styles.izquierda} onPress={() => router.push(`/deuda/${t.id}`)}>
                      {`Le debes ${formatearMonto(t.pendiente, t.unidad)} que tomaste de aquí`}
                    </Button>
                  ))}
                  {ajustes.length > 0 && (
                    <View style={styles.historial}>
                      <Text variant="labelLarge">Sin mover saldos</Text>
                      {ajustes.map((a) => (
                        <Text key={a.id} variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                          {`${formatearFechaCorta(new Date(a.fecha))} · ${a.nota ?? ''}: ${a.monto > 0 ? '−' : '+'}${formatearMonto(Math.abs(a.monto), deuda.unidad)}`}
                        </Text>
                      ))}
                    </View>
                  )}
                  {meDeben && !deuda.cerrada && deuda.pendiente > 0 && (
                    <Button mode="outlined" icon="whatsapp" onPress={recordarPorWhatsApp} style={styles.izquierda}>
                      Recordarle por WhatsApp
                    </Button>
                  )}
                  {/* Acciones a la vista, sin menú escondido. */}
                  <View style={styles.acciones}>
                    <Button
                      compact
                      mode="contained-tonal"
                      icon="pencil"
                      onPress={() => router.push(deuda.ajeno ? `/ajeno/editar/${deudaId}` : `/deuda/editar/${deudaId}`)}
                    >
                      Editar
                    </Button>
                    {!deuda.ajeno && (
                      <Button compact mode="outlined" icon={deuda.cerrada ? 'lock-open-variant' : 'check-circle'} onPress={alternarCerrada}>
                        {deuda.cerrada ? 'Reabrir' : 'Saldada'}
                      </Button>
                    )}
                    <Button compact mode="text" icon="delete" textColor={tema.colors.error} onPress={confirmarEliminar}>
                      Eliminar
                    </Button>
                  </View>
                </Card.Content>
              </Card>
              {deuda.ajeno ? (
                <>
                  <View style={styles.filaBotones}>
                    <Button mode="contained" icon="arrow-down" style={styles.flex} onPress={() => setEntrando(true)}>
                      Le entró dinero
                    </Button>
                    <Button
                      mode="contained"
                      icon="arrow-up"
                      style={styles.flex}
                      disabled={deuda.pendiente <= 0}
                      onPress={() => setPagando(true)}
                    >
                      Salió de lo suyo
                    </Button>
                  </View>
                  {deuda.pendiente > 0 && (
                    <Button mode="text" icon="hand-coin" style={styles.boton} onPress={() => setTomando(true)}>
                      Tomé prestado de lo suyo
                    </Button>
                  )}
                </>
              ) : (
                !deuda.cerrada &&
                deuda.pendiente > 0 && (
                  <Button mode="contained" icon="cash-plus" style={styles.boton} onPress={() => setPagando(true)}>
                    {deuda.origen_ajeno_id ? 'Devolver' : meDeben ? 'Registrar cobro' : 'Registrar pago'}
                  </Button>
                )
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
      {deuda?.ajeno && (
        <DialogoEntradaAjeno
          ajeno={deuda}
          visible={entrando}
          onCerrar={(guardado) => {
            setEntrando(false);
            if (guardado) {
              cargar();
              setVersion((v) => v + 1);
            }
          }}
        />
      )}
      {deuda?.ajeno && (
        <DialogoTomarPrestado
          ajeno={deuda}
          visible={tomando}
          onCerrar={(nueva) => {
            setTomando(false);
            if (nueva) cargar();
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  tarjeta: { margin: 16, marginBottom: 8 },
  contenido: { gap: 8 },
  izquierda: { alignSelf: 'flex-start' },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  boton: { marginHorizontal: 16, marginBottom: 8 },
  historial: { gap: 2 },
  flex: { flex: 1 },
  filaBotones: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 8 },
});
