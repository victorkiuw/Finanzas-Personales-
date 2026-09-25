import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Chip, HelperText, IconButton, Text, TextInput, useTheme } from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import { actualizarDeuda, ajenoYaEnSaldo, crearDineroAjeno, LARGO_MAXIMO_PERSONA, obtenerDeuda } from '../db/deudas';
import { formatearFechaCorta } from '../lib/fechas';
import { centimosATexto, formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';
import { SelectorBilletera } from './SelectorBilletera';

interface Fila {
  persona: string;
  montoTexto: string;
}

/**
 * "Le presté mi cuenta": dinero de una o varias personas que está en una de mis
 * billeteras. No es mío, así que no cuenta en lo disponible. Al editar se
 * corrige una sola persona.
 */
export function FormularioAjeno({ id, billeteraInicial = null }: { id?: number; billeteraInicial?: number | null }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const editando = id !== undefined;
  const [cargando, setCargando] = useState(true);
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [billeteraId, setBilleteraId] = useState<number | null>(billeteraInicial);
  const [filas, setFilas] = useState<Fila[]>([{ persona: '', montoTexto: '' }]);
  const [yaEnSaldo, setYaEnSaldo] = useState(true);
  const [fecha, setFecha] = useState(() => new Date());
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const lista = await listarBilleteras(db);
      setBilleteras(lista);
      if (id !== undefined) {
        const d = await obtenerDeuda(db, id);
        if (!d || !d.ajeno) {
          router.back();
          return;
        }
        setBilleteraId(d.billetera_id);
        setFilas([{ persona: d.persona, montoTexto: centimosATexto(d.monto) }]);
        setYaEnSaldo(await ajenoYaEnSaldo(db, id));
        setFecha(new Date(d.fecha));
        setNota(d.nota ?? '');
      }
      setCargando(false);
    })().catch((e) => Alert.alert('Error', String(e)));
  }, [db, id]);

  const billetera = billeteras.find((b) => b.id === billeteraId) ?? null;
  const moneda = billetera?.moneda ?? 'USD';
  const montos = filas.map((f) => parsearMonto(f.montoTexto));
  const suma = montos.reduce<number>((s, m) => s + (m ?? 0), 0);

  const cambiarFila = (i: number, cambio: Partial<Fila>) =>
    setFilas((l) => l.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  const elegirFecha = () =>
    DateTimePickerAndroid.open({
      value: fecha,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        const nueva = new Date(fecha);
        nueva.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        setFecha(nueva);
      },
    });

  const guardar = async () => {
    setError(null);
    if (!billeteraId) return setError('Elige en qué billetera está ese dinero.');
    if (filas.some((f) => !f.persona.trim())) return setError('Escribe el nombre de cada persona.');
    if (montos.some((m) => !m || m <= 0)) return setError('Escribe cuánto es de cada persona.');
    setGuardando(true);
    try {
      if (editando) {
        await actualizarDeuda(db, id, {
          tipo: 'DEBO',
          persona: filas[0].persona,
          moneda,
          monto: montos[0]!,
          fecha: fecha.toISOString(),
          nota,
          billetera_id: billeteraId,
          ajeno: true,
          ya_en_saldo: yaEnSaldo,
        });
        router.back();
      } else {
        const ids = await crearDineroAjeno(db, {
          billetera_id: billeteraId,
          fecha: fecha.toISOString(),
          ya_en_saldo: yaEnSaldo,
          personas: filas.map((f, i) => ({ persona: f.persona, monto: montos[i]! })),
          nota,
        });
        if (ids.length === 1) router.replace(`/deuda/${ids[0]}`);
        else router.back();
      }
    } catch (e) {
      setError(e instanceof ErrorValidacion ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <ActivityIndicator style={styles.cargando} />;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editando ? 'Editar dinero de otro' : 'Le presté mi cuenta' }} />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
          Dinero de otras personas que está en tu cuenta (le prestaste la cuenta, te lo dieron a guardar…). No es
          una deuda: solo se aparta para que no cuente como tuyo.
        </Text>

        <View style={styles.bloque}>
          <Text variant="labelLarge">¿En qué billetera está?</Text>
          <SelectorBilletera billeteras={billeteras} valor={billeteraId} onCambio={setBilleteraId} />
        </View>

        <View style={styles.bloque}>
          <Text variant="labelLarge">{editando ? '¿De quién es y cuánto?' : '¿De quién es y cuánto de cada uno?'}</Text>
          {filas.map((f, i) => (
            <View key={i} style={styles.fila}>
              <TextInput
                label="Persona"
                value={f.persona}
                onChangeText={(t) => cambiarFila(i, { persona: t })}
                maxLength={LARGO_MAXIMO_PERSONA}
                mode="outlined"
                autoFocus={!editando && i === filas.length - 1}
                style={styles.flex}
              />
              <TextInput
                label="Monto"
                value={f.montoTexto}
                onChangeText={(t) => cambiarFila(i, { montoTexto: t })}
                keyboardType="decimal-pad"
                mode="outlined"
                style={styles.flex}
                right={<TextInput.Affix text={INFO_MONEDA[moneda].corto} />}
              />
              {filas.length > 1 && (
                <IconButton
                  icon="close"
                  accessibilityLabel="Quitar persona"
                  onPress={() => setFilas((l) => l.filter((_, j) => j !== i))}
                />
              )}
            </View>
          ))}
          {!editando && (
            <Button
              mode="text"
              icon="account-plus"
              style={styles.izquierda}
              onPress={() => setFilas((l) => [...l, { persona: '', montoTexto: '' }])}
            >
              Agregar otra persona
            </Button>
          )}
          {filas.length > 1 && suma > 0 && (
            <HelperText type="info">{`En total, ${formatearMonto(suma, moneda)} de otras personas.`}</HelperText>
          )}
        </View>

        <View style={styles.bloque}>
          <Text variant="labelLarge">¿Ya está en el saldo de la billetera?</Text>
          <View style={styles.chips}>
            <Chip compact selected={yaEnSaldo} showSelectedCheck={false} mode={yaEnSaldo ? 'flat' : 'outlined'} onPress={() => setYaEnSaldo(true)}>
              Sí, ya está en el saldo
            </Chip>
            <Chip compact selected={!yaEnSaldo} showSelectedCheck={false} mode={!yaEnSaldo ? 'flat' : 'outlined'} onPress={() => setYaEnSaldo(false)}>
              No, entra ahora (sumarlo)
            </Chip>
          </View>
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            {yaEnSaldo
              ? 'El saldo de la billetera no cambia: solo se aparta lo que es de cada persona.'
              : 'Se suma al saldo de la billetera como dinero que entró.'}
          </Text>
        </View>

        <Button mode="outlined" icon="calendar" onPress={elegirFecha}>
          {`Desde el ${formatearFechaCorta(fecha)}`}
        </Button>

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
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  izquierda: { alignSelf: 'flex-start' },
});
