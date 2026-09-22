import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  HelperText,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import { actualizarDeuda, crearDeuda, LARGO_MAXIMO_PERSONA, obtenerDeuda, totalEnUnidad, type TipoDeuda } from '../db/deudas';
import { fechaSimpleLegible, formatearFechaCorta } from '../lib/fechas';
import { formatearMonto, INFO_MONEDA, MONEDAS, parsearMonto, type Moneda } from '../lib/moneda';
import { parsearTasa } from '../lib/tasa';
import { SelectorBilletera } from './SelectorBilletera';
import { SugerenciasTasa } from './SugerenciasTasa';

function aClaveFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Nueva deuda/préstamo. Al editar solo se cambian persona, fecha límite y nota:
 * los montos quedan fijos para no descuadrar los pagos ya registrados.
 */
export function FormularioDeuda({ id }: { id?: number }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const editando = id !== undefined;
  const [cargando, setCargando] = useState(true);
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [tipo, setTipo] = useState<TipoDeuda>('ME_DEBEN');
  const [persona, setPersona] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('BS');
  const [montoTexto, setMontoTexto] = useState('');
  const [indexada, setIndexada] = useState(true);
  const [tasaTexto, setTasaTexto] = useState('');
  const [fecha, setFecha] = useState(() => new Date());
  const [fechaLimite, setFechaLimite] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [billeteraId, setBilleteraId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      setBilleteras(await listarBilleteras(db));
      if (id !== undefined) {
        const d = await obtenerDeuda(db, id);
        if (!d) {
          router.back();
          return;
        }
        setTipo(d.tipo);
        setPersona(d.persona);
        setMoneda(d.moneda);
        setMontoTexto(String(d.monto / 100).replace('.', ','));
        setIndexada(d.tasa_referencia !== null);
        setTasaTexto(d.tasa_referencia ? String(d.tasa_referencia).replace('.', ',') : '');
        setFecha(new Date(d.fecha));
        setFechaLimite(d.fecha_limite);
        setNota(d.nota ?? '');
      }
      setCargando(false);
    })().catch((e) => Alert.alert('Error', String(e)));
  }, [db, id]);

  const monto = parsearMonto(montoTexto);
  const tasa = parsearTasa(tasaTexto);
  const usaTasa = moneda === 'BS' && indexada;
  const enDolares = usaTasa && monto && monto > 0 && tasa ? totalEnUnidad(monto, 'BS', tasa) : null;
  const billeterasMoneda = billeteras.filter((b) => b.moneda === moneda);

  const cambiarMoneda = (m: Moneda) => {
    setMoneda(m);
    // La billetera tiene que ser de la misma moneda que el préstamo.
    if (billeteras.find((b) => b.id === billeteraId)?.moneda !== m) setBilleteraId(null);
  };

  const elegirFecha = (cual: 'prestamo' | 'limite') => {
    const [a, m, d] = (fechaLimite ?? aClaveFecha(new Date())).split('-').map(Number);
    DateTimePickerAndroid.open({
      value: cual === 'prestamo' ? fecha : new Date(a, m - 1, d),
      mode: 'date',
      maximumDate: cual === 'prestamo' ? new Date() : undefined,
      minimumDate: cual === 'limite' ? new Date() : undefined,
      onChange: (e, elegida) => {
        if (e.type !== 'set' || !elegida) return;
        if (cual === 'limite') setFechaLimite(aClaveFecha(elegida));
        else {
          const nueva = new Date(fecha);
          nueva.setFullYear(elegida.getFullYear(), elegida.getMonth(), elegida.getDate());
          setFecha(nueva);
        }
      },
    });
  };

  const guardar = async () => {
    setError(null);
    if (editando) {
      setGuardando(true);
      try {
        await actualizarDeuda(db, id, { persona, fecha_limite: fechaLimite, nota });
        router.back();
      } catch (e) {
        setError(e instanceof ErrorValidacion ? e.message : String(e));
      } finally {
        setGuardando(false);
      }
      return;
    }
    if (!monto || monto <= 0) {
      setError('Escribe el monto.');
      return;
    }
    if (usaTasa && !tasa) {
      setError('Escribe la tasa a la que valoras el préstamo, o desactiva "Llevar la cuenta en dólares".');
      return;
    }
    setGuardando(true);
    try {
      const nuevo = await crearDeuda(db, {
        tipo,
        persona,
        moneda,
        monto,
        tasa_referencia: usaTasa ? tasa : null,
        fecha: fecha.toISOString(),
        fecha_limite: fechaLimite,
        nota,
        billetera_id: billeteraId,
      });
      router.replace(`/deuda/${nuevo}`);
    } catch (e) {
      setError(e instanceof ErrorValidacion ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <ActivityIndicator style={styles.cargando} />;

  const meDeben = tipo === 'ME_DEBEN';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editando ? 'Editar deuda' : 'Nueva deuda o préstamo' }} />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <SegmentedButtons
          value={tipo}
          onValueChange={(v) => setTipo(v as TipoDeuda)}
          buttons={[
            { value: 'ME_DEBEN', label: 'Presté (me deben)', disabled: editando },
            { value: 'DEBO', label: 'Me prestaron', disabled: editando },
          ]}
        />

        <TextInput
          label={meDeben ? '¿A quién le prestaste?' : '¿Quién te prestó?'}
          value={persona}
          onChangeText={setPersona}
          maxLength={LARGO_MAXIMO_PERSONA}
          mode="outlined"
          autoFocus={!editando}
        />

        {!editando && (
          <>
            <SegmentedButtons
              value={moneda}
              onValueChange={(v) => cambiarMoneda(v as Moneda)}
              buttons={MONEDAS.map((m) => ({ value: m, label: INFO_MONEDA[m].corto }))}
            />
            <View>
              <TextInput
                label="Monto"
                value={montoTexto}
                onChangeText={setMontoTexto}
                keyboardType="decimal-pad"
                mode="outlined"
                right={<TextInput.Affix text={INFO_MONEDA[moneda].corto} />}
              />
              {monto === null && montoTexto.trim() !== '' && <HelperText type="error">Número no válido</HelperText>}
            </View>

            {moneda === 'BS' && (
              <View style={styles.bloque}>
                <View style={styles.filaSwitch}>
                  <View style={styles.flex}>
                    <Text variant="labelLarge">Llevar la cuenta en dólares</Text>
                    <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                      Así, al pagarte, sabrás cuántos bolívares son a la tasa del día.
                    </Text>
                  </View>
                  <Switch value={indexada} onValueChange={setIndexada} />
                </View>
                {indexada && (
                  <>
                    <TextInput
                      label="Tasa a la que lo valoras (Bs. por USD)"
                      value={tasaTexto}
                      onChangeText={setTasaTexto}
                      keyboardType="decimal-pad"
                      mode="outlined"
                    />
                    <SugerenciasTasa
                      de="BS"
                      a="USD"
                      billeteras={billeteras.filter((b) => b.id === billeteraId)}
                      onElegir={setTasaTexto}
                    />
                    {enDolares !== null && (
                      <HelperText type="info">{`${meDeben ? 'Te debe' : 'Debes'} ${formatearMonto(enDolares, 'USD')}`}</HelperText>
                    )}
                  </>
                )}
              </View>
            )}

            <View style={styles.bloque}>
              <Text variant="labelLarge">{meDeben ? '¿De qué billetera salió el dinero?' : '¿A qué billetera entró?'}</Text>
              {billeterasMoneda.length > 0 ? (
                <>
                  <SelectorBilletera billeteras={billeterasMoneda} valor={billeteraId} onCambio={setBilleteraId} />
                  <Chip
                    compact
                    selected={billeteraId === null}
                    showSelectedCheck={false}
                    mode={billeteraId === null ? 'flat' : 'outlined'}
                    onPress={() => setBilleteraId(null)}
                    style={styles.chipNinguna}
                  >
                    Ninguna (no mover saldos)
                  </Chip>
                </>
              ) : (
                <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                  {`No tienes billeteras en ${INFO_MONEDA[moneda].nombre}: se registra sin mover saldos.`}
                </Text>
              )}
            </View>

            <Button mode="outlined" icon="calendar" onPress={() => elegirFecha('prestamo')}>
              {`Fecha del préstamo: ${formatearFechaCorta(fecha)}`}
            </Button>
          </>
        )}

        <View style={styles.filaSwitch}>
          <Button mode="outlined" icon="calendar-clock" onPress={() => elegirFecha('limite')} style={styles.flex}>
            {fechaLimite ? `Pagar antes del ${fechaSimpleLegible(fechaLimite)}` : 'Fecha límite (opcional)'}
          </Button>
          {fechaLimite && <Button onPress={() => setFechaLimite(null)}>Quitar</Button>}
        </View>

        <TextInput label="Nota (opcional)" value={nota} onChangeText={setNota} mode="outlined" multiline />

        {error && <HelperText type="error">{error}</HelperText>}
        <Button mode="contained" onPress={guardar} loading={guardando} disabled={guardando}>
          Guardar
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cargando: { marginTop: 48 },
  contenido: { padding: 16, gap: 16, paddingBottom: 48 },
  bloque: { gap: 8 },
  filaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chipNinguna: { alignSelf: 'flex-start' },
});
