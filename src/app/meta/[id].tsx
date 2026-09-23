import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Card, IconButton } from 'react-native-paper';

import { AporteAutomatico } from '../../components/AporteAutomatico';
import { DialogoFondosMeta } from '../../components/DialogoFondosMeta';
import { ListaMovimientos } from '../../components/ListaMovimientos';
import { ResumenMeta } from '../../components/TarjetaMeta';
import { obtenerMeta, type Meta } from '../../db/metas';

export default function DetalleMeta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const metaId = Number(id);
  const db = useSQLiteContext();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [dialogo, setDialogo] = useState<'APORTE_META' | 'RETIRO_META' | null>(null);
  // Fuerza a la lista a recargar tras abonar o retirar (la pantalla no pierde el foco).
  const [version, setVersion] = useState(0);

  const cargar = useCallback(() => {
    obtenerMeta(db, metaId)
      .then((m) => (m ? setMeta(m) : router.back()))
      .catch((e) => Alert.alert('Error', String(e)));
  }, [db, metaId]);

  useFocusEffect(cargar);

  const cerrarDialogo = (guardado: boolean) => {
    setDialogo(null);
    if (guardado) {
      cargar();
      setVersion((v) => v + 1);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: meta?.nombre ?? '',
          headerRight: () => (
            <IconButton
              icon="pencil"
              accessibilityLabel="Editar meta"
              onPress={() => router.push(`/meta/editar/${metaId}`)}
            />
          ),
        }}
      />
      <ListaMovimientos
        key={version}
        filtro={{ metaId }}
        textoVacio="Todavía no has abonado a esta meta."
        encabezado={
          meta ? (
            <View>
              <Card mode="contained" style={styles.tarjeta}>
                <Card.Content>
                  <ResumenMeta meta={meta} />
                </Card.Content>
              </Card>
              {!meta.archivada && (
                <View style={styles.acciones}>
                  <Button mode="contained" icon="plus" onPress={() => setDialogo('APORTE_META')} style={styles.flex}>
                    Abonar
                  </Button>
                  <Button
                    mode="contained-tonal"
                    icon="minus"
                    onPress={() => setDialogo('RETIRO_META')}
                    disabled={meta.saldo <= 0}
                    style={styles.flex}
                  >
                    Retirar
                  </Button>
                </View>
              )}
              {!meta.archivada && <AporteAutomatico meta={meta} onCambio={cargar} />}
            </View>
          ) : undefined
        }
      />
      {meta && <DialogoFondosMeta meta={meta} tipo={dialogo} onCerrar={cerrarDialogo} />}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tarjeta: { margin: 16, marginBottom: 8 },
  acciones: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
});
