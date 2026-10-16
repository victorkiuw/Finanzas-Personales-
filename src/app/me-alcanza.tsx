import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput, useTheme } from 'react-native-paper';

import { IconoCuadro } from '../components/IconoCuadro';
import { Pastilla } from '../components/ResumenSaldo';
import { useTasas } from '../components/TasasProvider';
import { listarBilleteras, type Billetera } from '../db/billeteras';
import { ajenoPorBilletera, listarDeudas } from '../db/deudas';
import { convertir, totalConsolidado } from '../lib/conversion';
import { formatearMonto, INFO_MONEDA, MONEDAS, parsearMonto, type Moneda } from '../lib/moneda';

/**
 * "¿Me alcanza?": escribes un precio y ves cuánto es en cada moneda y cuánto te
 * quedaría en cada billetera (y en total) si lo pagas.
 */
export default function MeAlcanza() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { cambio } = useTasas();
  const [texto, setTexto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [ajeno, setAjeno] = useState<Map<number, number>>(new Map());

  useFocusEffect(
    useCallback(() => {
      Promise.all([listarBilleteras(db), listarDeudas(db, { incluirCerradas: false })])
        .then(([b, d]) => {
          setBilleteras(b);
          setAjeno(ajenoPorBilletera(d));
        })
        .catch(() => {});
    }, [db]),
  );

  const precio = parsearMonto(texto);
  const mias = billeteras.filter((b) => b.en_total).map((b) => ({ ...b, saldo: b.saldo - (ajeno.get(b.id) ?? 0) }));
  const disponible = totalConsolidado(mias, moneda, cambio);
  const verde = tema.dark ? '#4ADE80' : '#2E7D32';
  const rojo = tema.dark ? '#F87171' : '#C62828';

  return (
    <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: '¿Me alcanza?' }} />
      <View style={styles.pastillas}>
        {MONEDAS.map((m) => (
          <Pastilla key={m} texto={INFO_MONEDA[m].corto} elegida={moneda === m} onPress={() => setMoneda(m)} />
        ))}
      </View>
      <TextInput
        label="¿Cuánto cuesta?"
        value={texto}
        onChangeText={setTexto}
        keyboardType="decimal-pad"
        mode="outlined"
        autoFocus
        style={styles.precio}
        right={<TextInput.Affix text={INFO_MONEDA[moneda].corto} />}
      />

      {precio !== null && precio > 0 && (
        <>
          <View style={[styles.caja, { backgroundColor: tema.colors.surfaceVariant }]}>
            <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
              Equivale a
            </Text>
            {MONEDAS.filter((m) => m !== moneda).map((m) => {
              const v = convertir(precio, moneda, m, cambio);
              return (
                <Text key={m} variant="titleMedium" style={styles.cifra}>
                  {v !== null ? formatearMonto(v, m) : `— (falta la tasa)`}
                </Text>
              );
            })}
          </View>

          {disponible !== null && (
            <View style={[styles.caja, { backgroundColor: tema.colors.surfaceVariant }]}>
              <Text variant="titleLarge" style={[styles.veredicto, { color: disponible >= precio ? verde : rojo }]}>
                {disponible >= precio ? '¡Sí te alcanza!' : 'No te alcanza todavía'}
              </Text>
              <Text variant="bodyMedium">
                {disponible >= precio
                  ? `De tu disponible te quedarían ${formatearMonto(disponible - precio, moneda)}.`
                  : `Te faltan ${formatearMonto(precio - disponible, moneda)} de tu disponible.`}
              </Text>
            </View>
          )}

          <Text variant="titleMedium" style={styles.subtitulo}>
            Si pagas con…
          </Text>
          {billeteras.map((b) => {
            const mio = b.saldo - (ajeno.get(b.id) ?? 0);
            const costo = convertir(precio, moneda, b.moneda, cambio);
            const queda = costo !== null ? mio - costo : null;
            return (
              <View key={b.id} style={[styles.fila, { backgroundColor: tema.colors.surfaceVariant }]}>
                <IconoCuadro icono={b.icono} color={b.color_hex} tamano={40} />
                <View style={styles.flex}>
                  <Text variant="bodyLarge">{b.nombre}</Text>
                  <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                    {costo !== null ? `Pagas ${formatearMonto(costo, b.moneda)} · tienes ${formatearMonto(mio, b.moneda)}` : 'Falta la tasa'}
                  </Text>
                </View>
                {queda !== null && (
                  <Text variant="titleSmall" style={[styles.cifra, { color: queda >= 0 ? verde : rojo }]}>
                    {queda >= 0 ? `Quedan ${formatearMonto(queda, b.moneda)}` : `Faltan ${formatearMonto(-queda, b.moneda)}`}
                  </Text>
                )}
              </View>
            );
          })}
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            Los dólares van a tasa BCV, el USDT a tasa USDT y los euros al euro BCV. No cuenta el dinero de otras personas.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: 16, gap: 12, paddingBottom: 48 },
  pastillas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  precio: { fontSize: 24 },
  caja: { borderRadius: 22, padding: 16, gap: 6 },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  veredicto: { fontWeight: '800' },
  subtitulo: { marginTop: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 12 },
});
