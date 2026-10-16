import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Switch, Text, useTheme } from 'react-native-paper';

import { Reordenable } from '../components/Reordenable';
import { guardarPreferencia, leerPreferencia } from '../db/preferencias';
import { CLAVE_SECCIONES, leerSecciones, NOMBRE_SECCION, SECCIONES_INICIO, type Seccion } from '../lib/seccionesInicio';

/** Elegir qué secciones salen en Inicio y en qué orden (arrastrándolas). */
export default function PersonalizarInicio() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [secciones, setSecciones] = useState<Seccion[] | null>(null);
  const [moviendo, setMoviendo] = useState(false);

  useEffect(() => {
    leerPreferencia(db, CLAVE_SECCIONES)
      .then((v) => setSecciones(leerSecciones(v)))
      .catch(() => setSecciones(SECCIONES_INICIO));
  }, [db]);

  const guardar = (nuevas: Seccion[]) => {
    setSecciones(nuevas);
    guardarPreferencia(db, CLAVE_SECCIONES, JSON.stringify(nuevas)).catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={styles.contenido} scrollEnabled={!moviendo}>
      <Stack.Screen options={{ title: 'Personalizar Inicio' }} />
      <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
        Mantén presionada una sección y arrástrala para cambiar su lugar. Apaga las que no quieras ver. El balance siempre va
        arriba.
      </Text>
      {secciones && (
        <Reordenable
          items={secciones}
          clave={(s) => s.clave}
          onArrastre={setMoviendo}
          onReordenar={guardar}
          estilo={styles.lista}
          render={(s, levantado) => {
            const info = NOMBRE_SECCION[s.clave];
            return (
              <View
                style={[
                  styles.fila,
                  { backgroundColor: levantado ? tema.colors.secondaryContainer : tema.colors.surfaceVariant, opacity: s.visible ? 1 : 0.55 },
                ]}
              >
                <Icon source="drag" size={22} color={tema.colors.onSurfaceVariant} />
                <Icon source={info.icono} size={22} color={tema.colors.primary} />
                <Text variant="bodyLarge" style={styles.nombre}>
                  {info.nombre}
                </Text>
                <Switch
                  value={s.visible}
                  onValueChange={(v) => guardar(secciones.map((x) => (x.clave === s.clave ? { ...x, visible: v } : x)))}
                  accessibilityLabel={`Mostrar ${info.nombre}`}
                />
              </View>
            );
          }}
        />
      )}
      <Button mode="text" icon="restore" onPress={() => guardar(SECCIONES_INICIO)}>
        Volver al orden original
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 16, paddingBottom: 48 },
  lista: { gap: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  nombre: { flex: 1 },
});
