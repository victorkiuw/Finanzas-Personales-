import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Button, Card, Dialog, FAB, HelperText, Portal, ProgressBar, Text, TextInput, useTheme } from 'react-native-paper';

import { actualizarAvisosVencimientos } from '../lib/avisos';
import { guardarLimite, leerLimite, listarCompras, resumenCuotas, type CompraCuotas } from '../db/cuotas';
import { fechaSimpleLegible } from '../lib/fechas';
import { centimosATexto, formatearMonto, parsearMonto } from '../lib/moneda';

/** Pestaña "Cuotas" de Ahorros: compras en Cashea, límite de crédito y próximas cuotas. */
export function SeccionCuotas({ encabezado }: { encabezado: ReactNode }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [compras, setCompras] = useState<CompraCuotas[]>([]);
  const [limite, setLimite] = useState<number | null>(null);
  const [editandoLimite, setEditandoLimite] = useState(false);
  const [limiteTexto, setLimiteTexto] = useState('');

  const cargar = useCallback(() => {
    Promise.all([listarCompras(db), leerLimite(db)])
      .then(([c, l]) => {
        setCompras(c);
        setLimite(l);
        // Tras registrar o pagar una compra, los avisos de las cuotas se reprograman.
        actualizarAvisosVencimientos(db).catch(() => {});
      })
      .catch((e) => Alert.alert('Error', String(e)));
  }, [db]);
  useFocusEffect(cargar);

  const r = resumenCuotas(compras, limite);
  const activas = compras.filter((c) => c.pendiente > 0);
  const pagadas = compras.filter((c) => c.pendiente === 0);

  const guardar = async () => {
    const valor = limiteTexto.trim() === '' ? null : parsearMonto(limiteTexto);
    try {
      await guardarLimite(db, valor);
      setEditandoLimite(false);
      cargar();
    } catch (e) {
      Alert.alert('Límite', String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <View style={styles.flex}>
      <FlatList
        data={[...activas, ...pagadas]}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListHeaderComponent={
          <>
            {encabezado}
            <Card mode="contained" style={styles.tarjeta}>
              <Card.Content style={styles.bloque}>
                <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
                  Cashea
                </Text>
                <Text variant="titleLarge" style={styles.cifra}>
                  {r.limite !== null
                    ? `Usado ${formatearMonto(r.usado, 'USD')} de ${formatearMonto(r.limite, 'USD')}`
                    : `Debes ${formatearMonto(r.usado, 'USD')}`}
                </Text>
                {r.limite !== null && (
                  <>
                    <ProgressBar progress={r.limite > 0 ? Math.min(r.usado / r.limite, 1) : 0} style={styles.barra} />
                    <Text variant="bodyMedium">{`Disponible: ${formatearMonto(r.disponible ?? 0, 'USD')}`}</Text>
                  </>
                )}
                {r.proxima && (
                  <Text variant="bodyMedium">
                    {`Próxima cuota: ${formatearMonto(r.proxima.cuota.monto, 'USD')} de ${r.proxima.comercio} el ${fechaSimpleLegible(r.proxima.cuota.fecha)}`}
                  </Text>
                )}
                <Button
                  compact
                  mode="text"
                  icon="pencil"
                  style={styles.izquierda}
                  onPress={() => {
                    setLimiteTexto(limite ? centimosATexto(limite) : '');
                    setEditandoLimite(true);
                  }}
                >
                  {limite ? 'Cambiar límite de crédito' : 'Poner mi límite de crédito'}
                </Button>
              </Card.Content>
            </Card>
          </>
        }
        renderItem={({ item: c }) => (
          <Card mode="outlined" style={[styles.tarjeta, c.pendiente === 0 && styles.pagada]} onPress={() => router.push(`/cuota/${c.id}`)}>
            <Card.Title
              title={c.comercio}
              subtitle={
                c.pendiente === 0
                  ? 'Pagada'
                  : `${c.calendario.filter((q) => q.pagada).length} de ${c.cuotas} cuotas pagadas`
              }
            />
            <Card.Content style={styles.bloque}>
              {c.pendiente > 0 && (
                <>
                  <Text variant="titleMedium" style={styles.cifra}>{`Falta ${formatearMonto(c.pendiente, 'USD')}`}</Text>
                  {c.proxima && (
                    <Text variant="bodyMedium">{`Próxima: ${formatearMonto(c.proxima.monto, 'USD')} el ${fechaSimpleLegible(c.proxima.fecha)}`}</Text>
                  )}
                </>
              )}
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Text variant="bodyMedium" style={[styles.centrado, { color: tema.colors.onSurfaceVariant }]}>
              Registra tus compras en Cashea: la app arma el calendario de cuotas cada 14 días, te avisa un día antes y te
              dice cuánto es en bolívares.
            </Text>
            <Button mode="contained" icon="cart-plus" onPress={() => router.push('/cuota/nueva')}>
              Registrar una compra
            </Button>
          </View>
        }
      />
      {compras.length > 0 && (
        <FAB icon="cart-plus" label="Compra" style={styles.fab} onPress={() => router.push('/cuota/nueva')} />
      )}

      <Portal>
        <Dialog visible={editandoLimite} onDismiss={() => setEditandoLimite(false)}>
          <Dialog.Title>Límite de crédito</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Tu línea en Cashea"
              value={limiteTexto}
              onChangeText={setLimiteTexto}
              keyboardType="decimal-pad"
              mode="outlined"
              autoFocus
              right={<TextInput.Affix text="USD" />}
            />
            <HelperText type="info">Déjalo vacío si no quieres llevarlo. Cámbialo cuando subas de nivel.</HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditandoLimite(false)}>Cancelar</Button>
            <Button onPress={guardar}>Guardar</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tarjeta: { marginHorizontal: 16, marginBottom: 12 },
  pagada: { opacity: 0.6 },
  bloque: { gap: 6 },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  barra: { height: 6, borderRadius: 3 },
  izquierda: { alignSelf: 'flex-start' },
  vacio: { padding: 24, gap: 12, marginTop: 8 },
  centrado: { textAlign: 'center' },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
