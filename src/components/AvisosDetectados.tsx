import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';

import { borrarAviso, leerAvisos, type AvisoBanco } from '../../modules/lector-notificaciones';
import type { Billetera } from '../db/billeteras';
import { interpretarAviso } from '../lib/avisosBanco';
import { formatearHora } from '../lib/fechas';
import { formatearMonto } from '../lib/moneda';

/** Tarjeta de Inicio con los avisos del banco que parecen movimientos, para registrarlos con un toque. */
export function AvisosDetectados({ billeteras }: { billeteras: Billetera[] }) {
  const tema = useTheme();
  const [avisos, setAvisos] = useState<AvisoBanco[]>([]);
  useFocusEffect(
    useCallback(() => {
      setAvisos(leerAvisos());
    }, []),
  );

  const propuestas = avisos
    .map((a) => ({ aviso: a, mov: interpretarAviso(a, billeteras) }))
    .filter((p) => p.mov !== null)
    .slice(0, 5);
  if (propuestas.length === 0) return null;

  const quitar = (id: string) => {
    borrarAviso(id);
    setAvisos((l) => l.filter((a) => a.id !== id));
  };

  return (
    <Card mode="contained" style={[styles.tarjeta, { backgroundColor: tema.colors.secondaryContainer }]}>
      <Card.Title title="Avisos del banco" subtitle="¿Los registro?" />
      <Card.Content style={styles.lista}>
        {propuestas.map(({ aviso, mov }) => (
          <View key={aviso.id} style={styles.item}>
            <Text variant="bodyMedium" numberOfLines={2}>
              {`${mov!.tipo === 'INGRESO' ? '+' : '-'}${formatearMonto(mov!.monto, mov!.moneda)} · ${aviso.app} · ${formatearHora(new Date(aviso.fecha).toISOString())}`}
            </Text>
            <Text variant="bodySmall" numberOfLines={2} style={{ color: tema.colors.onSurfaceVariant }}>
              {aviso.texto || aviso.titulo}
            </Text>
            <View style={styles.acciones}>
              <Button compact onPress={() => quitar(aviso.id)}>
                Ignorar
              </Button>
              <Button
                compact
                mode="contained-tonal"
                onPress={() => {
                  quitar(aviso.id);
                  const params: Record<string, string> = { tipo: mov!.tipo, monto: String(mov!.monto), nota: mov!.nota };
                  if (mov!.billeteraId) params.billetera = String(mov!.billeteraId);
                  router.push({ pathname: '/movimiento/nuevo', params });
                }}
              >
                Registrar
              </Button>
            </View>
          </View>
        ))}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  tarjeta: { marginHorizontal: 16, marginBottom: 8 },
  lista: { gap: 12 },
  item: { gap: 2 },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
