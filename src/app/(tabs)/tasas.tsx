import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Dialog,
  Divider,
  HelperText,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { useTasas } from '../../components/TasasProvider';
import { NOMBRE_PAR, PARES, type Par } from '../../lib/api-tasas';
import { brecha, convertir } from '../../lib/conversion';
import { formatearFechaCorta, haceCuanto } from '../../lib/fechas';
import { formatearMonto, INFO_MONEDA, MONEDAS, parsearMonto, type Moneda } from '../../lib/moneda';
import { formatearTasa, parsearTasa, tasaATexto } from '../../lib/tasa';

export default function PantallaTasas() {
  const tema = useTheme();
  const { tasas, actualizando, error, actualizar, guardarManual } = useTasas();
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [montoTexto, setMontoTexto] = useState('1');
  const [editando, setEditando] = useState<Par | null>(null);
  const [tasaManual, setTasaManual] = useState('');

  const monto = parsearMonto(montoTexto);
  const otras = MONEDAS.filter((m) => m !== moneda);
  const bcv = tasas.BCV?.tasa;
  const paralelo = tasas.PARALELO?.tasa;

  const abrirEdicion = (par: Par) => {
    setTasaManual(tasas[par] ? tasaATexto(tasas[par].tasa) : '');
    setEditando(par);
  };

  const guardar = async () => {
    const valor = parsearTasa(tasaManual);
    if (!editando || !valor) return;
    await guardarManual(editando, valor);
    setEditando(null);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <Text variant="titleMedium">Calculadora</Text>
        <SegmentedButtons
          value={moneda}
          onValueChange={(v) => setMoneda(v as Moneda)}
          buttons={MONEDAS.map((m) => ({ value: m, label: INFO_MONEDA[m].corto }))}
        />
        <TextInput
          label="Monto"
          value={montoTexto}
          onChangeText={setMontoTexto}
          keyboardType="decimal-pad"
          mode="outlined"
          style={styles.monto}
          selectTextOnFocus
          right={<TextInput.Affix text={INFO_MONEDA[moneda].corto} />}
        />
        {monto === null && montoTexto.trim() !== '' && <HelperText type="error">Número no válido</HelperText>}

        {PARES.map((par) => {
          const tasa = tasas[par]?.tasa;
          return (
            <Card key={par} mode="outlined">
              <Card.Content style={styles.resultado}>
                <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
                  {`Con tasa ${NOMBRE_PAR[par]}`}
                </Text>
                {!tasa ? (
                  <Text variant="bodyMedium">Sin tasa disponible.</Text>
                ) : (
                  otras.map((m) => (
                    <Text key={m} variant="headlineSmall" style={styles.cifra}>
                      {monto !== null ? formatearMonto(convertir(monto, moneda, m, tasa), m) : '—'}
                    </Text>
                  ))
                )}
              </Card.Content>
            </Card>
          );
        })}
        <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
          USD y USDT se toman como equivalentes (1:1). El bolívar se convierte con cada tasa.
        </Text>

        <Divider style={styles.divisor} />

        <View style={styles.filaTitulo}>
          <Text variant="titleMedium" style={styles.flex}>
            Tasas del día
          </Text>
          <Button icon="refresh" mode="contained-tonal" loading={actualizando} disabled={actualizando} onPress={() => actualizar(true)}>
            Actualizar
          </Button>
        </View>
        {error && (
          <HelperText type="error">{`${error} Se usa la última tasa guardada.`}</HelperText>
        )}

        {PARES.map((par) => {
          const t = tasas[par];
          return (
            <Card key={par} mode="contained" onPress={() => abrirEdicion(par)}>
              <Card.Content style={styles.tasa}>
                <View style={styles.flex}>
                  <Text variant="labelLarge">{par === 'BCV' ? 'BCV (oficial)' : 'Paralelo (mercado / USDT)'}</Text>
                  <Text variant="headlineMedium" style={styles.cifra}>
                    {t ? `${formatearTasa(t.tasa)}` : '—'}
                    <Text variant="bodyMedium">{t ? '  Bs./USD' : ''}</Text>
                  </Text>
                  <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                    {!t
                      ? 'Toca para escribirla a mano'
                      : t.origen === 'MANUAL'
                        ? `Escrita a mano ${haceCuanto(t.ultima_actualizacion)}`
                        : `Cotización del ${formatearFechaCorta(new Date(t.ultima_actualizacion))} · consultada ${t.consultada_en ? haceCuanto(t.consultada_en) : ''}`}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          );
        })}
        {bcv && paralelo && (
          <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
            {`Brecha: el paralelo está ${brecha(bcv, paralelo).toFixed(1).replace('.', ',')}% sobre el BCV.`}
          </Text>
        )}
        <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
          Fuente: ve.dolarapi.com. Se actualizan solas cada 30 minutos cuando hay internet; toca una tasa para
          corregirla a mano.
        </Text>
      </ScrollView>

      <Portal>
        <Dialog visible={editando !== null} onDismiss={() => setEditando(null)}>
          <Dialog.Title>{editando ? `Tasa ${NOMBRE_PAR[editando]}` : ''}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Bs. por dólar"
              value={tasaManual}
              onChangeText={setTasaManual}
              keyboardType="decimal-pad"
              mode="outlined"
              autoFocus
            />
            <HelperText type="info">Se reemplazará en la próxima actualización automática.</HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditando(null)}>Cancelar</Button>
            <Button onPress={guardar} disabled={!parsearTasa(tasaManual)}>
              Guardar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: 16, gap: 12, paddingBottom: 48 },
  monto: { fontSize: 24 },
  resultado: { gap: 2 },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  divisor: { marginVertical: 8 },
  filaTitulo: { flexDirection: 'row', alignItems: 'center' },
  tasa: { flexDirection: 'row', alignItems: 'center' },
});
