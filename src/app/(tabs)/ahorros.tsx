import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, FAB, List, SegmentedButtons, Text, useTheme } from 'react-native-paper';

import { TarjetaDeuda } from '../../components/TarjetaDeuda';
import { TarjetaMeta } from '../../components/TarjetaMeta';
import { useTasas } from '../../components/TasasProvider';
import { listarDeudas, resumenDeudas, type Deuda } from '../../db/deudas';
import { listarMetas, type Meta } from '../../db/metas';
import { NOMBRE_PAR } from '../../lib/api-tasas';
import { formatearMonto } from '../../lib/moneda';

type Seccion = 'metas' | 'deudas';

export default function PantallaAhorros() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { tasas, referencia } = useTasas();
  const [seccion, setSeccion] = useState<Seccion>('metas');
  const [metas, setMetas] = useState<Meta[] | null>(null);
  const [deudas, setDeudas] = useState<Deuda[]>([]);
  const [verArchivadas, setVerArchivadas] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([listarMetas(db, { incluirArchivadas: true }), listarDeudas(db)])
        .then(([m, d]) => {
          setMetas(m);
          setDeudas(d);
        })
        .catch((e) => Alert.alert('Error', String(e)));
    }, [db]),
  );

  if (!metas) return <ActivityIndicator style={styles.cargando} />;

  const selector = (
    <SegmentedButtons
      style={styles.selector}
      value={seccion}
      onValueChange={(v) => setSeccion(v as Seccion)}
      buttons={[
        { value: 'metas', label: 'Metas', icon: 'flag-checkered' },
        { value: 'deudas', label: 'Deudas y préstamos', icon: 'handshake' },
      ]}
    />
  );

  if (seccion === 'deudas') {
    const abiertas = deudas.filter((d) => !d.cerrada);
    const saldadas = deudas.filter((d) => d.cerrada);
    const resumen = resumenDeudas(abiertas, tasas[referencia]?.tasa ?? null);
    return (
      <View style={styles.flex}>
        <FlatList
          data={abiertas}
          keyExtractor={(d) => String(d.id)}
          renderItem={({ item }) => (
            <TarjetaDeuda deuda={item} tasas={tasas} onPress={() => router.push(`/deuda/${item.id}`)} />
          )}
          contentContainerStyle={{ paddingBottom: 96 }}
          ListHeaderComponent={
            <>
              {selector}
              {abiertas.length > 0 && (
                <Card mode="contained" style={styles.resumen}>
                  <Card.Content style={styles.filaResumen}>
                    <View style={styles.flex}>
                      <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
                        Te deben
                      </Text>
                      <Text variant="titleLarge" style={styles.cifra}>{`≈ ${formatearMonto(resumen.meDeben, 'USD')}`}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
                        Debes
                      </Text>
                      <Text variant="titleLarge" style={styles.cifra}>{`≈ ${formatearMonto(resumen.debo, 'USD')}`}</Text>
                    </View>
                  </Card.Content>
                  <Card.Content>
                    <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                      {`Deudas en Bs. sin indexar convertidas con la tasa ${NOMBRE_PAR[referencia]}.`}
                      {resumen.completo ? '' : ' Falta la tasa para convertir algunas.'}
                    </Text>
                  </Card.Content>
                </Card>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.vacio}>
              <Text variant="titleMedium" style={styles.centrado}>
                Sin deudas pendientes
              </Text>
              <Text variant="bodyMedium" style={[styles.centrado, { color: tema.colors.onSurfaceVariant }]}>
                Registra lo que prestas y lo que te prestan. Si prestas en bolívares puedes llevar la cuenta en
                dólares para cobrar a la tasa del día.
              </Text>
              <Button mode="contained" icon="handshake" onPress={() => router.push('/deuda/nueva')}>
                Registrar deuda o préstamo
              </Button>
            </View>
          }
          ListFooterComponent={
            saldadas.length > 0 ? (
              <List.Accordion
                title={`Saldadas (${saldadas.length})`}
                expanded={verArchivadas}
                onPress={() => setVerArchivadas((v) => !v)}
                style={{ backgroundColor: tema.colors.background }}
              >
                {saldadas.map((d) => (
                  <TarjetaDeuda key={d.id} deuda={d} tasas={tasas} onPress={() => router.push(`/deuda/${d.id}`)} />
                ))}
              </List.Accordion>
            ) : null
          }
        />
        {abiertas.length > 0 && (
          <FAB icon="plus" label="Deuda" style={styles.fab} onPress={() => router.push('/deuda/nueva')} />
        )}
      </View>
    );
  }

  const activas = metas.filter((m) => !m.archivada);
  const archivadas = metas.filter((m) => m.archivada);
  const abrir = (m: Meta) => router.push(`/meta/${m.id}`);

  return (
    <View style={styles.flex}>
      <FlatList
        data={activas}
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item }) => <TarjetaMeta meta={item} onPress={() => abrir(item)} />}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListHeaderComponent={selector}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Text variant="titleMedium" style={styles.centrado}>
              Sin metas de ahorro
            </Text>
            <Text variant="bodyMedium" style={[styles.centrado, { color: tema.colors.onSurfaceVariant }]}>
              Crea una meta y ve apartando dinero de tus billeteras. Lo que abonas sale de la billetera pero sigue
              contando en tu patrimonio.
            </Text>
            <Button mode="contained" icon="flag-plus" onPress={() => router.push('/meta/nueva')}>
              Crear una meta
            </Button>
          </View>
        }
        ListFooterComponent={
          archivadas.length > 0 ? (
            <List.Accordion
              title={`Archivadas (${archivadas.length})`}
              expanded={verArchivadas}
              onPress={() => setVerArchivadas((v) => !v)}
              style={{ backgroundColor: tema.colors.background }}
            >
              {archivadas.map((m) => (
                <TarjetaMeta key={m.id} meta={m} onPress={() => abrir(m)} />
              ))}
            </List.Accordion>
          ) : null
        }
      />
      {activas.length > 0 && (
        <FAB icon="plus" label="Meta" style={styles.fab} onPress={() => router.push('/meta/nueva')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cargando: { marginTop: 48 },
  selector: { margin: 16 },
  resumen: { marginHorizontal: 16, marginBottom: 12 },
  filaResumen: { flexDirection: 'row', gap: 16 },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  vacio: { padding: 24, gap: 12, marginTop: 16 },
  centrado: { textAlign: 'center' },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
