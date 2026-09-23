import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, HelperText, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import type { Meta } from '../db/metas';
import { aporteDeMeta, claveHoy, guardarAporteDeMeta, proyeccionMeta, type Frecuencia, type Recurrente } from '../db/recurrentes';
import { fechaSimpleLegible } from '../lib/fechas';
import { centimosATexto, formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';
import { SelectorBilletera } from './SelectorBilletera';

const FRECUENCIAS: { value: Frecuencia; label: string }[] = [
  { value: 'SEMANAL', label: 'Semana' },
  { value: 'QUINCENAL', label: 'Quincena' },
  { value: 'MENSUAL', label: 'Mes' },
];

/** Aporte automático a la meta ("cada quincena pasa $20") y cuándo se llegaría al objetivo. */
export function AporteAutomatico({ meta, onCambio }: { meta: Meta; onCambio: () => void }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [aporte, setAporte] = useState<Recurrente | null>(null);
  const [editando, setEditando] = useState(false);
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [montoTexto, setMontoTexto] = useState('');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('QUINCENAL');
  const [billeteraId, setBilleteraId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(claveHoy());
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    aporteDeMeta(db, meta.id).then(setAporte).catch(() => {});
  }, [db, meta.id]);
  useEffect(cargar, [cargar, meta.saldo]);

  const abrir = async () => {
    const b = (await listarBilleteras(db)).filter((x) => x.moneda === meta.moneda);
    setBilleteras(b);
    setMontoTexto(aporte ? centimosATexto(aporte.monto) : '');
    setFrecuencia(aporte?.frecuencia ?? 'QUINCENAL');
    setBilleteraId(aporte?.billetera_id ?? b[0]?.id ?? null);
    setFecha(aporte?.proxima_fecha ?? claveHoy());
    setError(null);
    setEditando(true);
  };

  const guardar = async (quitar = false) => {
    const monto = parsearMonto(montoTexto);
    try {
      if (!quitar && (!monto || monto <= 0 || !billeteraId)) throw new ErrorValidacion('Escribe el monto y elige la billetera.');
      await guardarAporteDeMeta(db, meta.id, quitar ? null : { monto: monto!, billetera_id: billeteraId!, frecuencia, proxima_fecha: fecha });
      setEditando(false);
      cargar();
      onCambio();
    } catch (e) {
      setError(e instanceof ErrorValidacion ? e.message : String(e));
    }
  };

  const elegirFecha = () => {
    const [a, m, d] = fecha.split('-').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(a, m - 1, d),
      mode: 'date',
      minimumDate: new Date(),
      onChange: (e, f) => {
        if (e.type === 'set' && f) setFecha(claveHoy(f));
      },
    });
  };

  const falta = meta.monto_objetivo - meta.saldo;
  const proyeccion = aporte ? proyeccionMeta(falta, aporte) : null;

  if (!editando) {
    return (
      <Card mode="outlined" style={styles.tarjeta}>
        <Card.Content style={styles.bloque}>
          <Text variant="labelLarge">Aporte automático</Text>
          {aporte ? (
            <>
              <Text variant="bodyMedium">
                {`${formatearMonto(aporte.monto, meta.moneda)} cada ${FRECUENCIAS.find((f) => f.value === aporte.frecuencia)!.label.toLowerCase()} desde ${aporte.billetera_nombre}. Próximo: ${fechaSimpleLegible(aporte.proxima_fecha)}.`}
              </Text>
              {proyeccion && (
                <Text variant="bodyMedium" style={{ color: tema.colors.primary }}>
                  {`A este ritmo llegas a la meta el ${fechaSimpleLegible(proyeccion.fecha)} (${proyeccion.aportes} aportes).`}
                </Text>
              )}
            </>
          ) : (
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              Aparta dinero solo cada semana, quincena o mes, y mira cuándo llegarías a la meta.
            </Text>
          )}
          <Button compact mode="text" icon={aporte ? 'pencil' : 'autorenew'} style={styles.izquierda} onPress={abrir}>
            {aporte ? 'Cambiar' : 'Configurar aporte automático'}
          </Button>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card mode="outlined" style={styles.tarjeta}>
      <Card.Content style={styles.bloque}>
        <Text variant="labelLarge">Aporte automático</Text>
        <TextInput
          label="Monto de cada aporte"
          value={montoTexto}
          onChangeText={setMontoTexto}
          keyboardType="decimal-pad"
          mode="outlined"
          dense
          right={<TextInput.Affix text={INFO_MONEDA[meta.moneda].corto} />}
        />
        <Text variant="bodySmall">Cada</Text>
        <SegmentedButtons value={frecuencia} onValueChange={(v) => setFrecuencia(v as Frecuencia)} buttons={FRECUENCIAS} />
        {billeteras.length > 0 ? (
          <SelectorBilletera billeteras={billeteras} valor={billeteraId} onCambio={setBilleteraId} />
        ) : (
          <Text variant="bodySmall" style={{ color: tema.colors.error }}>
            {`Necesitas una billetera en ${INFO_MONEDA[meta.moneda].nombre.toLowerCase()} para el aporte automático.`}
          </Text>
        )}
        <Button mode="outlined" icon="calendar" onPress={elegirFecha}>
          {`Primer aporte: ${fechaSimpleLegible(fecha)}`}
        </Button>
        {error && <HelperText type="error">{error}</HelperText>}
        <View style={styles.fila}>
          {aporte && (
            <Button textColor={tema.colors.error} onPress={() => guardar(true)}>
              Quitar
            </Button>
          )}
          <View style={styles.flex} />
          <Button onPress={() => setEditando(false)}>Cancelar</Button>
          <Button mode="contained" onPress={() => guardar()}>
            Guardar
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tarjeta: { marginHorizontal: 16, marginBottom: 8 },
  bloque: { gap: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  izquierda: { alignSelf: 'flex-start' },
});
