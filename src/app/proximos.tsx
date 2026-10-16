import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SegmentedButtons, Text, useTheme } from 'react-native-paper';

import { IconoCuadro } from '../components/IconoCuadro';
import { claveHoy } from '../db/recurrentes';
import { formatearDia } from '../lib/fechas';
import { formatearMonto } from '../lib/moneda';
import { cargarProximos, colorSentido, type Evento } from '../lib/proximos';

/** Calendario de lo que viene: recurrentes, cuotas, deudas por cobrar o pagar y metas, por fecha. */
export default function PantallaProximos() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [dias, setDias] = useState(30);
  const [eventos, setEventos] = useState<Evento[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      cargarProximos(db, dias)
        .then(setEventos)
        .catch(() => setEventos([]));
    }, [db, dias]),
  );

  const secciones: { titulo: string; data: Evento[] }[] = [];
  for (const e of eventos ?? []) {
    const titulo = e.fecha === claveHoy() ? 'Hoy' : formatearDia(`${e.fecha}T12:00:00`);
    if (secciones.at(-1)?.titulo !== titulo) secciones.push({ titulo, data: [] });
    secciones.at(-1)!.data.push(e);
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Lo que viene' }} />
      <SectionList
        sections={secciones}
        keyExtractor={(e, i) => `${e.ruta}-${e.fecha}-${i}`}
        contentContainerStyle={styles.lista}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <SegmentedButtons
            value={String(dias)}
            onValueChange={(v) => setDias(Number(v))}
            buttons={[
              { value: '7', label: '7 días' },
              { value: '30', label: '30 días' },
              { value: '90', label: '3 meses' },
            ]}
            style={styles.selector}
          />
        }
        ListEmptyComponent={
          eventos ? (
            <Text variant="bodyMedium" style={[styles.vacio, { color: tema.colors.onSurfaceVariant }]}>
              Nada por ahora. Aquí salen tus recurrentes, las cuotas de Cashea, las deudas con fecha límite y las metas con fecha.
            </Text>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text variant="labelLarge" style={[styles.dia, { color: tema.colors.onSurfaceVariant }]}>
            {section.titulo}
          </Text>
        )}
        renderItem={({ item }) => {
          const color = colorSentido(item.sentido, tema.dark);
          return (
            <Pressable
              onPress={() => router.push(item.ruta as never)}
              style={[styles.tarjeta, { backgroundColor: tema.colors.surfaceVariant }]}
              accessibilityRole="button"
            >
              <IconoCuadro icono={item.icono} color={color} tamano={40} />
              <View style={styles.flex}>
                <Text variant="bodyLarge" numberOfLines={1}>
                  {item.titulo}
                </Text>
                <Text variant="bodySmall" numberOfLines={1} style={{ color: tema.colors.onSurfaceVariant }}>
                  {item.detalle}
                </Text>
              </View>
              <Text variant="titleSmall" style={[styles.monto, { color }]}>
                {`${item.sentido === 'entra' ? '+' : item.sentido === 'sale' ? '-' : ''}${formatearMonto(item.monto, item.moneda)}`}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lista: { padding: 16, paddingBottom: 48, gap: 8 },
  selector: { marginBottom: 4 },
  vacio: { marginTop: 24, textAlign: 'center' },
  dia: { marginTop: 12, marginBottom: 2, marginLeft: 4 },
  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 12 },
  monto: { fontVariant: ['tabular-nums'], fontWeight: '700' },
});
