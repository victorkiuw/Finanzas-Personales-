import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, Chip, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import { devolverAAjeno, obtenerDeuda, registrarPagoDeuda, type Deuda } from '../db/deudas';
import { centimosATexto, equivalentes, formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';
import { calcularTasa, enviadoConTasa, parsearTasa, recibidoConTasa, tasaATexto, unidadTasa } from '../lib/tasa';
import { SelectorBilletera } from './SelectorBilletera';
import { SugerenciasTasa } from './SugerenciasTasa';

interface Props {
  deuda: Deuda;
  visible: boolean;
  onCerrar: (guardado: boolean) => void;
}

/**
 * Registrar un cobro (me deben) o un pago (debo), en cualquier billetera y a la
 * tasa pactada. Si la deuda salió de un dinero ajeno que guardo, se puede
 * devolver "a lo que le guardo" (vuelve a ser suyo, con la transferencia si
 * sale de otra billetera) o entregárselo.
 */
export function DialogoPagoDeuda({ deuda, visible, onCerrar }: Props) {
  const db = useSQLiteContext();
  const [todas, setTodas] = useState<Billetera[]>([]);
  // Dinero ajeno del que salió esta deuda, si es el caso.
  const [guardado, setGuardado] = useState<Deuda | null>(null);
  const [aGuardado, setAGuardado] = useState(true);
  const [billeteraId, setBilleteraId] = useState<number | null>(null);
  const [montoTexto, setMontoTexto] = useState('');
  const [tasaTexto, setTasaTexto] = useState('');
  const [equivalenteTexto, setEquivalenteTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [alturaTeclado, setAlturaTeclado] = useState(0);
  const { height: altoPantalla } = useWindowDimensions();

  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', (e) => setAlturaTeclado(e.endCoordinates.height));
    const b = Keyboard.addListener('keyboardDidHide', () => setAlturaTeclado(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setMontoTexto('');
    setTasaTexto('');
    setEquivalenteTexto('');
    setError(null);
    setAGuardado(true);
    (async () => {
      const b = await listarBilleteras(db);
      const origen = deuda.origen_ajeno_id ? await obtenerDeuda(db, deuda.origen_ajeno_id) : null;
      const g = origen?.ajeno && origen.billetera_id && b.some((x) => x.id === origen.billetera_id) ? origen : null;
      setTodas(b);
      setGuardado(g);
      // Por defecto, la billetera donde se guarda el dinero ajeno o una en la moneda original del préstamo.
      const propia = deuda.ajeno || g ? (g ?? deuda).billetera_id : null;
      setBilleteraId((b.find((x) => x.id === propia) ?? b.find((x) => x.moneda === deuda.moneda) ?? b[0])?.id ?? null);
    })().catch((e) => setError(String(e)));
  }, [db, visible, deuda]);

  const meDeben = deuda.tipo === 'ME_DEBEN';
  const devolviendo = guardado !== null && aGuardado;
  // Al devolver a lo guardado: si lo guardado va en la misma moneda que la deuda, el cambio es
  // entre la billetera de origen y lo guardado (el P2P); si no (Bs. llevados en dólares), el
  // dinero sale en la moneda de lo guardado y el cambio es contra la deuda.
  const guardadoIgualDeuda = guardado !== null && equivalentes(guardado.moneda, deuda.unidad);
  const billeteras = devolviendo && !guardadoIgualDeuda ? todas.filter((b) => b.moneda === guardado.moneda) : todas;
  const billetera = billeteras.find((b) => b.id === billeteraId) ?? null;
  const de = billetera?.moneda ?? deuda.unidad;
  const a = devolviendo && guardadoIgualDeuda ? guardado.moneda : deuda.unidad;
  // USD y USDT se toman 1:1; con bolívares de por medio hace falta una tasa.
  const conCambio = billetera !== null && de !== a;
  const tasaPorDefecto = conCambio && equivalentes(de, a) ? 1 : null;
  const tasa = parsearTasa(tasaTexto) ?? tasaPorDefecto;
  const monto = parsearMonto(montoTexto);
  const equivalente = !conCambio
    ? monto
    : equivalenteTexto.trim() !== ''
      ? parsearMonto(equivalenteTexto)
      : monto && monto > 0 && tasa
        ? recibidoConTasa(de, a, monto, tasa)
        : null;

  const cambiarMonto = (t: string) => {
    setMontoTexto(t);
    const m = parsearMonto(t);
    const escrita = parsearTasa(tasaTexto) ?? tasaPorDefecto;
    if (conCambio && m && m > 0 && escrita) setEquivalenteTexto(centimosATexto(recibidoConTasa(de, a, m, escrita)));
    else if (!escrita) setEquivalenteTexto('');
  };
  const cambiarTasa = (t: string) => {
    setTasaTexto(t);
    const nueva = parsearTasa(t);
    if (!nueva) return;
    const e = parsearMonto(equivalenteTexto);
    if (monto && monto > 0) setEquivalenteTexto(centimosATexto(recibidoConTasa(de, a, monto, nueva)));
    else if (e && e > 0) setMontoTexto(centimosATexto(enviadoConTasa(de, a, e, nueva)));
  };
  // Funciona en los dos sentidos: con una tasa, escribir un monto calcula el otro;
  // sin tasa, escribir los dos montos calcula la tasa.
  const cambiarEquivalente = (t: string) => {
    setEquivalenteTexto(t);
    const e = parsearMonto(t);
    if (!e || e <= 0) return;
    const tasaActual = parsearTasa(tasaTexto) ?? tasaPorDefecto;
    if (tasaActual) setMontoTexto(centimosATexto(enviadoConTasa(de, a, e, tasaActual)));
    else if (monto && monto > 0) setTasaTexto(tasaATexto(calcularTasa(de, a, monto, e)));
  };

  /** Llena el monto con todo lo pendiente, convertido a la moneda de la billetera con la tasa actual. */
  const pagarTodo = () => {
    if (!conCambio) {
      setMontoTexto(centimosATexto(deuda.pendiente));
      return;
    }
    if (!tasa) {
      setError('Elige o escribe primero la tasa.');
      return;
    }
    // Inverso de recibidoConTasa: cuánto hay que mover en la billetera para cubrir lo pendiente.
    const necesario = enviadoConTasa(de, a, deuda.pendiente, tasa);
    setMontoTexto(centimosATexto(necesario));
    setEquivalenteTexto(centimosATexto(deuda.pendiente));
    setError(null);
  };

  const guardar = async () => {
    if (!billetera) return;
    if (!monto || monto <= 0) {
      setError('Escribe el monto.');
      return;
    }
    if (conCambio && (!equivalente || equivalente <= 0)) {
      setError('Indica la tasa o cuánto descuenta de la deuda.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const fecha = new Date().toISOString();
      if (devolviendo && guardadoIgualDeuda) {
        await devolverAAjeno(db, {
          deuda_id: deuda.id,
          monto: conCambio ? equivalente! : monto,
          desde_billetera_id: billetera.id,
          monto_origen: monto,
          fecha,
        });
      } else if (devolviendo) {
        await devolverAAjeno(db, {
          deuda_id: deuda.id,
          monto,
          monto_unidad: conCambio ? equivalente : null,
          desde_billetera_id: billetera.id,
          fecha,
        });
      } else {
        await registrarPagoDeuda(db, {
          deuda_id: deuda.id,
          billetera_id: billetera.id,
          monto,
          monto_unidad: conCambio ? equivalente : null,
          fecha,
        });
      }
      onCerrar(true);
    } catch (e) {
      setError(e instanceof ErrorValidacion ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={() => onCerrar(false)} style={{ marginBottom: alturaTeclado }}>
        <Dialog.Title>
          {deuda.ajeno ? `Entregar a ${deuda.persona}` : guardado ? `Devolver a ${deuda.persona}` : meDeben ? `Cobro a ${deuda.persona}` : `Pago a ${deuda.persona}`}
        </Dialog.Title>
        <Dialog.ScrollArea style={[styles.area, { maxHeight: Math.max(altoPantalla - alturaTeclado - 260, 160) }]}>
          <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
            <Text variant="bodyMedium">
              {`${deuda.ajeno ? 'Le guardas' : 'Pendiente'}: ${formatearMonto(deuda.pendiente, deuda.unidad)}`}
            </Text>
            {deuda.ajeno && (
              <Text variant="bodySmall">Lo que le das o gastas por esa persona sale de tu billetera y deja de guardarse.</Text>
            )}
            {guardado && (
              <>
                <Text variant="labelLarge">¿A dónde va?</Text>
                <View style={styles.chips}>
                  <Chip
                    compact
                    selected={aGuardado}
                    showSelectedCheck={false}
                    mode={aGuardado ? 'flat' : 'outlined'}
                    onPress={() => {
                      setAGuardado(true);
                      setBilleteraId(guardado.billetera_id);
                      setTasaTexto('');
                      setEquivalenteTexto('');
                    }}
                  >
                    {`A lo que le guardo en ${guardado.billetera_nombre}`}
                  </Chip>
                  <Chip
                    compact
                    selected={!aGuardado}
                    showSelectedCheck={false}
                    mode={!aGuardado ? 'flat' : 'outlined'}
                    onPress={() => setAGuardado(false)}
                  >
                    Se lo entrego
                  </Chip>
                </View>
                {aGuardado && (
                  <Text variant="bodySmall">
                    {guardadoIgualDeuda
                      ? `Si ya lo tienes en ${guardado.billetera_nombre}, déjala elegida. Si lo compraste con otra cuenta (P2P), elige esa y escribe la tasa o lo que pagaste: se registra la transferencia.`
                      : `Vuelve a ser suyo en ${guardado.billetera_nombre}; escribe a cuánto está el dólar para saber cuánto descuenta.`}
                  </Text>
                )}
              </>
            )}
            <Text variant="labelLarge">{meDeben ? 'Entra a' : 'Sale de'}</Text>
            <SelectorBilletera
              billeteras={billeteras}
              valor={billeteraId}
              onCambio={(id) => {
                setBilleteraId(id);
                setTasaTexto('');
                setEquivalenteTexto('');
              }}
            />

            {conCambio && (
              <>
                <TextInput
                  label={`Tasa (${unidadTasa(de, a)})`}
                  value={tasaTexto}
                  placeholder={tasaPorDefecto ? '1' : undefined}
                  onChangeText={cambiarTasa}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  dense
                />
                <SugerenciasTasa de={de} a={a} billeteras={[billetera]} onElegir={cambiarTasa} />
              </>
            )}

            <View style={styles.fila}>
              <TextInput
                label={meDeben ? 'Monto recibido' : devolviendo && conCambio && guardadoIgualDeuda ? 'Pagaste' : 'Monto pagado'}
                value={montoTexto}
                onChangeText={cambiarMonto}
                keyboardType="decimal-pad"
                mode="outlined"
                style={styles.flex}
                right={<TextInput.Affix text={INFO_MONEDA[de].corto} />}
              />
              {conCambio && (
                <TextInput
                  label={devolviendo && guardadoIgualDeuda ? 'Llega' : 'Descuenta'}
                  value={equivalenteTexto}
                  placeholder={equivalente ? centimosATexto(equivalente) : undefined}
                  onChangeText={cambiarEquivalente}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  style={styles.flex}
                  right={<TextInput.Affix text={INFO_MONEDA[a].corto} />}
                />
              )}
            </View>
            <Chip compact icon="check-all" onPress={pagarTodo} style={styles.chipTodo}>
              Todo lo pendiente
            </Chip>
            {equivalente !== null && equivalente > 0 && (
              <HelperText type="info">
                {`Descuenta ${formatearMonto(Math.min(equivalente, deuda.pendiente), a)}; quedarían ${formatearMonto(Math.max(deuda.pendiente - equivalente, 0), a)}.`}
              </HelperText>
            )}
            {error && <HelperText type="error">{error}</HelperText>}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={() => onCerrar(false)}>Cancelar</Button>
          <Button onPress={guardar} loading={guardando} disabled={guardando || !billetera}>
            Registrar
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  area: { paddingHorizontal: 0 },
  contenido: { paddingHorizontal: 24, paddingVertical: 12, gap: 12 },
  fila: { flexDirection: 'row', gap: 8 },
  chipTodo: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
