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
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import {
  actualizarDeuda,
  ajenoYaEnSaldo,
  billeteraDeDeuda,
  crearDeuda,
  LARGO_MAXIMO_PERSONA,
  obtenerDeuda,
  totalEnUnidad,
  type TipoDeuda,
} from '../db/deudas';
import { tasaDelDia } from '../db/tasas';
import { NOMBRE_PAR, PARES, type ParDolar } from '../lib/api-tasas';
import { claveDia, fechaSimpleLegible, formatearFechaCorta } from '../lib/fechas';
import { centimosATexto, formatearMonto, INFO_MONEDA, MONEDAS, parsearMonto, type Moneda } from '../lib/moneda';
import { formatearTasa, parsearTasa, tasaATexto } from '../lib/tasa';
import { SelectorBilletera } from './SelectorBilletera';
import { useTasas } from './TasasProvider';

const NOMBRE_CORTO: Record<Moneda, string> = { BS: 'Bolívares', USD: 'Dólares', USDT: 'USDT', EUR: 'Euros' };

function aClaveFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Nueva deuda/préstamo o edición completa de una existente (el movimiento del
 * préstamo en la billetera se ajusta solo).
 */
type Modo = TipoDeuda | 'AJENO';

export function FormularioDeuda({
  id,
  ajenoInicial = false,
  billeteraInicial = null,
}: {
  id?: number;
  /** Abrir directamente como "dinero de otro". */
  ajenoInicial?: boolean;
  billeteraInicial?: number | null;
}) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const editando = id !== undefined;
  const [cargando, setCargando] = useState(true);
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [modo, setModo] = useState<Modo>(ajenoInicial ? 'AJENO' : 'ME_DEBEN');
  // Dinero ajeno: ¿ya estaba en la billetera o entra ahora?
  const [yaEnSaldo, setYaEnSaldo] = useState(true);
  // Deuda que nació de tomar prestado de lo que guardo: no mueve saldos.
  const [deAjeno, setDeAjeno] = useState(false);
  const [persona, setPersona] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('BS');
  const [montoTexto, setMontoTexto] = useState('');
  const [tasaTexto, setTasaTexto] = useState('');
  // La tasa se llena sola con la del día del préstamo hasta que el usuario la escribe o elige.
  const [tasaElegida, setTasaElegida] = useState(false);
  const [tasasDelDia, setTasasDelDia] = useState<Partial<Record<ParDolar, number>>>({});
  const { referencia, versionHistorial } = useTasas();
  const [fecha, setFecha] = useState(() => new Date());
  const [fechaLimite, setFechaLimite] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [billeteraId, setBilleteraId] = useState<number | null>(billeteraInicial);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [tienePagos, setTienePagos] = useState(false);

  useEffect(() => {
    (async () => {
      const lista = await listarBilleteras(db);
      setBilleteras(lista);
      const inicial = lista.find((b) => b.id === billeteraInicial);
      if (id === undefined && inicial) setMoneda(inicial.moneda);
      if (id !== undefined) {
        const d = await obtenerDeuda(db, id);
        if (!d) {
          router.back();
          return;
        }
        setModo(d.ajeno ? 'AJENO' : d.tipo);
        setDeAjeno(d.origen_ajeno_id !== null);
        if (d.ajeno) setYaEnSaldo(await ajenoYaEnSaldo(db, id));
        setPersona(d.persona);
        setMoneda(d.moneda);
        setMontoTexto(centimosATexto(d.monto));
        setTasaTexto(d.tasa_referencia ? tasaATexto(d.tasa_referencia) : '');
        setTasaElegida(d.tasa_referencia !== null);
        setBilleteraId(await billeteraDeDeuda(db, id));
        setTienePagos(d.pagado > 0);
        setFecha(new Date(d.fecha));
        setFechaLimite(d.fecha_limite);
        setNota(d.nota ?? '');
      }
      setCargando(false);
    })().catch((e) => Alert.alert('Error', String(e)));
  }, [db, id, billeteraInicial]);

  // Tasas BCV y USDT del día del préstamo (del historial); la de la referencia elegida se pone sola.
  const dia = claveDia(fecha.toISOString());
  useEffect(() => {
    if (moneda !== 'BS' || cargando || modo === 'AJENO') return;
    let vigente = true;
    Promise.all(PARES.map((p) => tasaDelDia(db, p, dia)))
      .then(([bcv, usdt]) => {
        if (!vigente) return;
        const delDia = { BCV: bcv ?? undefined, PARALELO: usdt ?? undefined };
        setTasasDelDia(delDia);
        const sugerida = delDia[referencia];
        if (!tasaElegida && sugerida) setTasaTexto(tasaATexto(sugerida));
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [db, dia, moneda, referencia, cargando, tasaElegida, versionHistorial, modo]);

  const monto = parsearMonto(montoTexto);
  const tasa = parsearTasa(tasaTexto);
  // Si se prestaron bolívares, se devuelven bolívares al valor del dólar del día: siempre lleva tasa.
  const ajeno = modo === 'AJENO';
  const tipo: TipoDeuda = modo === 'AJENO' ? 'DEBO' : modo;
  const usaTasa = moneda === 'BS' && !ajeno;
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
          // Otra fecha: se vuelve a poner la tasa de ese día.
          setTasaElegida(false);
        }
      },
    });
  };

  const guardar = async () => {
    setError(null);
    if (!monto || monto <= 0) {
      setError('Escribe el monto.');
      return;
    }
    if (ajeno && !billeteraId) {
      setError('Elige en qué billetera guardas ese dinero.');
      return;
    }
    if (usaTasa && !tasa) {
      setError('Escribe a cuánto estaba el dólar el día del préstamo.');
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        tipo,
        persona,
        moneda,
        monto,
        tasa_referencia: usaTasa ? tasa : null,
        fecha: fecha.toISOString(),
        fecha_limite: ajeno ? null : fechaLimite,
        nota,
        billetera_id: deAjeno ? null : billeteraId,
        ajeno,
        ya_en_saldo: ajeno ? yaEnSaldo : undefined,
      };
      if (editando) {
        await actualizarDeuda(db, id, datos);
        router.back();
      } else {
        const nuevo = await crearDeuda(db, datos);
        router.replace(`/deuda/${nuevo}`);
      }
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
      <Stack.Screen
        options={{
          title: ajeno ? (editando ? 'Editar dinero de otro' : 'Dinero de otra persona') : editando ? 'Editar deuda' : 'Nueva deuda o préstamo',
        }}
      />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        {!deAjeno && (
          <SegmentedButtons
            value={modo}
            onValueChange={(v) => setModo(v as Modo)}
            buttons={[
              { value: 'ME_DEBEN', label: 'Presté', disabled: tienePagos },
              { value: 'DEBO', label: 'Me prestaron', disabled: tienePagos },
              { value: 'AJENO', label: 'Es de otro', disabled: tienePagos },
            ]}
          />
        )}
        {ajeno && (
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            Dinero de otra persona que tienes en una de tus cuentas (por ejemplo, lo de tu abuela en Binance). No se
            cuenta como tuyo en lo disponible.
          </Text>
        )}
        {deAjeno && (
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            Lo tomaste prestado de lo que le guardas: si corriges el monto, lo guardado se ajusta solo.
          </Text>
        )}
        {tienePagos && (
          <HelperText type="info">
            Ya tiene pagos: puedes corregir el monto y la tasa, pero para cambiar el tipo o pasar entre bolívares y
            dólares borra antes los pagos.
          </HelperText>
        )}

        <TextInput
          label={ajeno ? '¿De quién es el dinero?' : meDeben ? '¿A quién le prestaste?' : '¿Quién te prestó?'}
          value={persona}
          onChangeText={setPersona}
          maxLength={LARGO_MAXIMO_PERSONA}
          mode="outlined"
          autoFocus={!editando}
        />

        {ajeno && (
          <View style={styles.bloque}>
            <Text variant="labelLarge">¿En qué billetera lo tienes?</Text>
            <SelectorBilletera
              billeteras={billeteras}
              valor={billeteraId}
              onCambio={(b) => {
                setBilleteraId(b);
                const m = billeteras.find((x) => x.id === b)?.moneda;
                if (m) setMoneda(m);
              }}
            />
            <Text variant="labelLarge">¿Cómo llegó ese dinero?</Text>
            <View style={styles.chips}>
                <Chip compact selected={yaEnSaldo} showSelectedCheck={false} mode={yaEnSaldo ? 'flat' : 'outlined'} onPress={() => setYaEnSaldo(true)}>
                  Ya está en el saldo
                </Chip>
                <Chip compact selected={!yaEnSaldo} showSelectedCheck={false} mode={!yaEnSaldo ? 'flat' : 'outlined'} onPress={() => setYaEnSaldo(false)}>
                  Me lo acaba de dar (sumarlo)
                </Chip>
            </View>
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              {yaEnSaldo
                ? 'El saldo de la billetera no cambia: solo se aparta lo que es de esa persona.'
                : 'Se suma al saldo de la billetera como un dinero que entró.'}
            </Text>
          </View>
        )}

        {!ajeno && (
        <View style={styles.bloque}>
          <Text variant="labelLarge">{meDeben ? '¿Qué le prestaste?' : '¿Qué te prestaron?'}</Text>
          <SegmentedButtons
            value={moneda}
            onValueChange={(v) => cambiarMoneda(v as Moneda)}
            buttons={MONEDAS.map((m) => ({ value: m, label: NOMBRE_CORTO[m], disabled: deAjeno }))}
          />
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            {moneda === 'BS'
              ? `Se devuelve en bolívares, pero lo que ${meDeben ? 'te deben' : 'debes'} sube con el dólar: si ${meDeben ? 'prestaste' : 'te prestaron'} Bs. 5.000 y el dólar sube, hoy ${meDeben ? 'te deben' : 'debes'} más bolívares.`
              : `Se devuelve lo mismo en ${INFO_MONEDA[moneda].nombre.toLowerCase()}.`}
          </Text>
        </View>
        )}
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

        <Button mode="outlined" icon="calendar" onPress={() => elegirFecha('prestamo')}>
          {`${ajeno ? 'Lo tienes desde el' : meDeben ? 'Le prestaste el' : 'Te prestó el'} ${formatearFechaCorta(fecha)}`}
        </Button>

        {usaTasa && (
          <View style={styles.bloque}>
            <TextInput
              label="¿A cuánto estaba el dólar ese día? (Bs.)"
              value={tasaTexto}
              onChangeText={(t) => {
                setTasaTexto(t);
                setTasaElegida(true);
              }}
              keyboardType="decimal-pad"
              mode="outlined"
            />
            <View style={styles.chips}>
              {PARES.filter((p) => tasasDelDia[p]).map((p) => (
                <Chip
                  key={p}
                  compact
                  icon="calendar-check"
                  selected={parsearTasa(tasaTexto) === Number(tasaATexto(tasasDelDia[p]!).replace(',', '.'))}
                  showSelectedCheck={false}
                  onPress={() => {
                    setTasaTexto(tasaATexto(tasasDelDia[p]!));
                    setTasaElegida(true);
                  }}
                >
                  {`${NOMBRE_PAR[p]} ${formatearTasa(tasasDelDia[p]!)}`}
                </Chip>
              ))}
            </View>
            {!tasasDelDia.BCV && !tasasDelDia.PARALELO && (
              <HelperText type="info">No hay tasas guardadas de ese día: escríbela a mano.</HelperText>
            )}
            {enDolares !== null && (
              <HelperText type="info">{`Eso era ${formatearMonto(enDolares, 'USD')}. Al pagar${meDeben ? 'te' : ''}, se calcula cuántos bolívares son a la tasa de ese día.`}</HelperText>
            )}
          </View>
        )}

        {!ajeno && !deAjeno && (
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
        )}

        {!ajeno && (
        <View style={styles.filaSwitch}>
          <Button mode="outlined" icon="calendar-clock" onPress={() => elegirFecha('limite')} style={styles.flex}>
            {fechaLimite ? `Pagar antes del ${fechaSimpleLegible(fechaLimite)}` : 'Fecha límite (opcional)'}
          </Button>
          {fechaLimite && <Button onPress={() => setFechaLimite(null)}>Quitar</Button>}
        </View>
        )}

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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
