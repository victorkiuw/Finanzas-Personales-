import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';

import { BarraAnimada } from '../components/BarraAnimada';
import { useListo } from '../components/ConfirmacionListo';
import { Pastilla } from '../components/ResumenSaldo';
import { guardarPreferencia, leerPreferencia } from '../db/preferencias';
import { CLAVE_RETO_52, diasConGasto, rachaSinGastar, totalReto52, type Reto52 } from '../db/retos';
import { formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';
import { vibrar } from '../lib/vibrar';

const DIAS_REVISADOS = 120;

/** Retos de ahorro: racha de días sin gastar y el reto de las 52 semanas. */
export default function PantallaRetos() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const mostrarListo = useListo();
  const [racha, setRacha] = useState<{ actual: number; mejor: number } | null>(null);
  const [reto, setReto] = useState<Reto52 | null>(null);
  const [baseTexto, setBaseTexto] = useState('1');
  const [monedaReto, setMonedaReto] = useState<Reto52['moneda']>('USD');

  useFocusEffect(
    useCallback(() => {
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - DIAS_REVISADOS);
      diasConGasto(db, inicio.toISOString())
        .then((dias) => setRacha(rachaSinGastar(dias, inicio)))
        .catch(() => {});
      leerPreferencia(db, CLAVE_RETO_52)
        .then((v) => setReto(v ? (JSON.parse(v) as Reto52) : null))
        .catch(() => {});
    }, [db]),
  );

  const guardarReto = (r: Reto52 | null) => {
    setReto(r);
    if (r) guardarPreferencia(db, CLAVE_RETO_52, JSON.stringify(r)).catch(() => {});
    else db.runAsync(`DELETE FROM preferencias WHERE clave = ?`, [CLAVE_RETO_52]).catch(() => {});
  };

  const alternarSemana = (n: number) => {
    if (!reto) return;
    const marcada = reto.marcadas.includes(n);
    vibrar(marcada ? 'suave' : 'media');
    const marcadas = marcada ? reto.marcadas.filter((x) => x !== n) : [...reto.marcadas, n];
    guardarReto({ ...reto, marcadas });
    if (!marcada && marcadas.length === 52) mostrarListo('¡Reto completado! 🏆');
  };

  const total = reto ? totalReto52(reto) : null;

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: 'Retos de ahorro' }} />

      <View style={[styles.caja, { backgroundColor: tema.colors.surfaceVariant }]}>
        <Text variant="titleMedium">Días sin gastar</Text>
        <View style={styles.racha}>
          <Text style={styles.fuego}>🔥</Text>
          <View>
            <Text variant="displaySmall" style={styles.numero}>
              {racha?.actual ?? '—'}
            </Text>
            <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
              {racha?.actual === 1 ? 'día seguido' : 'días seguidos'}
            </Text>
          </View>
        </View>
        <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
          {`Tu mejor racha: ${racha?.mejor ?? 0} días. Los gastos fijos (alquiler, servicios) y las comisiones no la rompen; cualquier otro gasto sí. Hoy cuenta mientras no gastes.`}
        </Text>
      </View>

      <View style={[styles.caja, { backgroundColor: tema.colors.surfaceVariant }]}>
        <Text variant="titleMedium">Reto de las 52 semanas</Text>
        <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
          La semana 1 apartas la base, la semana 2 el doble, y así hasta la 52. Toca cada semana cuando la cumplas.
        </Text>
        {!reto ? (
          <>
            <View style={styles.fila}>
              <TextInput
                label="Base (semana 1)"
                value={baseTexto}
                onChangeText={setBaseTexto}
                keyboardType="decimal-pad"
                mode="outlined"
                dense
                style={styles.flex}
                right={<TextInput.Affix text={INFO_MONEDA[monedaReto].corto} />}
              />
              <Button
                mode="contained"
                onPress={() => {
                  const base = parsearMonto(baseTexto);
                  if (base && base > 0) guardarReto({ base, moneda: monedaReto, marcadas: [] });
                }}
              >
                Empezar
              </Button>
            </View>
            <View style={styles.fila}>
              {(['USD', 'USDT', 'BS', 'EUR'] as const).map((m) => (
                <Pastilla key={m} texto={INFO_MONEDA[m].corto} elegida={monedaReto === m} onPress={() => setMonedaReto(m)} />
              ))}
            </View>
            {parsearMonto(baseTexto) ? (
              <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                {`Al final habrás ahorrado ${formatearMonto(totalReto52({ base: parsearMonto(baseTexto)!, moneda: monedaReto, marcadas: [] }).meta, monedaReto)}.`}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text variant="titleLarge" style={styles.numero}>
              {`${formatearMonto(total!.ahorrado, reto.moneda)} de ${formatearMonto(total!.meta, reto.moneda)}`}
            </Text>
            <View style={[styles.pista, { backgroundColor: tema.colors.outlineVariant }]}>
              <BarraAnimada porcentaje={(total!.ahorrado / total!.meta) * 100} style={[styles.relleno, { backgroundColor: tema.colors.primary }]} />
            </View>
            <View style={styles.rejilla}>
              {Array.from({ length: 52 }, (_, i) => i + 1).map((n) => {
                const hecha = reto.marcadas.includes(n);
                return (
                  <Pressable
                    key={n}
                    onPress={() => alternarSemana(n)}
                    accessibilityLabel={`Semana ${n}: ${formatearMonto(n * reto.base, reto.moneda)}`}
                    style={[styles.semana, { backgroundColor: hecha ? tema.colors.primaryContainer : tema.colors.outlineVariant }]}
                  >
                    <Text variant="labelSmall" style={{ color: hecha ? tema.colors.onPrimaryContainer : tema.colors.onSurface, fontWeight: '700' }}>
                      {n}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Button mode="text" icon="restart" textColor={tema.colors.error} onPress={() => guardarReto(null)}>
              Empezar de nuevo
            </Button>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: 16, gap: 12, paddingBottom: 48 },
  caja: { borderRadius: 24, padding: 16, gap: 10 },
  racha: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  fuego: { fontSize: 56 },
  numero: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pista: { height: 10, borderRadius: 5, overflow: 'hidden' },
  relleno: { height: 10 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  semana: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
