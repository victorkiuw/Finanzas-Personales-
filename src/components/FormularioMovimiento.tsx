import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  HelperText,
  IconButton,
  Modal,
  Portal,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { ErrorValidacion, listarBilleteras, type Billetera } from '../db/billeteras';
import { dividirGasto, partesIguales, type ParteDivision } from '../db/dividir';
import { cambioDe } from '../db/tasas';
import { convertir } from '../lib/conversion';
import { crearPlantilla } from '../db/plantillas';
import { listarCategorias, type Categoria } from '../db/categorias';
import {
  actualizarMovimiento,
  crearMovimiento,
  eliminarMovimiento,
  LARGO_MAXIMO_NOTA,
  listarMovimientos,
  obtenerMovimiento,
  type Movimiento,
  type TipoMovimiento,
} from '../db/movimientos';
import { elegirComprobante } from '../lib/comprobantes';
import { formatearFechaCorta, formatearHora } from '../lib/fechas';
import { centimosATexto, equivalentes, formatearMonto, INFO_MONEDA, parsearMonto } from '../lib/moneda';
import { calcularTasa, enviadoConTasa, parsearTasa, recibidoConTasa, tasaATexto, unidadTasa } from '../lib/tasa';
import {
  calcularComision,
  comisionPara,
  describirComision,
  destinoPorDefecto,
  tieneComision,
  type DestinoPago,
} from '../lib/comision';
import { SelectorBilletera } from './SelectorBilletera';
import { useTasas } from './TasasProvider';
import { SugerenciasTasa } from './SugerenciasTasa';

interface Props {
  /** Si no se indica, se crea un movimiento nuevo. */
  id?: number;
  tipoInicial?: TipoMovimiento;
  billeteraInicial?: number;
  /** Para llenar el formulario (movimientos rápidos, dictado por voz). */
  montoInicial?: number;
  categoriaInicial?: number;
  notaInicial?: string;
}

const TIPOS: { value: TipoMovimiento; label: string; icon: string }[] = [
  { value: 'GASTO', label: 'Gasto', icon: 'arrow-up' },
  { value: 'INGRESO', label: 'Ingreso', icon: 'arrow-down' },
  { value: 'TRANSFERENCIA', label: 'Transferir', icon: 'swap-horizontal' },
];

/** Color de cada tipo: gastos en rojo, ingresos en verde y transferencias en azul. */
export const COLOR_TIPO: Record<TipoMovimiento, string> = {
  GASTO: '#C62828',
  INGRESO: '#2E7D32',
  TRANSFERENCIA: '#1565C0',
};

export function FormularioMovimiento({
  id,
  tipoInicial = 'GASTO',
  billeteraInicial,
  montoInicial,
  categoriaInicial,
  notaInicial,
}: Props) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const editando = id !== undefined;

  const [cargando, setCargando] = useState(true);
  const [original, setOriginal] = useState<Movimiento | null>(null);
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [tipo, setTipo] = useState<TipoMovimiento>(tipoInicial);
  const [montoTexto, setMontoTexto] = useState('');
  const [origenId, setOrigenId] = useState<number | null>(null);
  const [destinoId, setDestinoId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [recibidoTexto, setRecibidoTexto] = useState('');
  const [tasaTexto, setTasaTexto] = useState('');
  const [fecha, setFecha] = useState(() => new Date());
  const [nota, setNota] = useState('');
  // null = decide la configuración de la billetera; true/false = el usuario lo cambió.
  const [usarComision, setUsarComision] = useState<boolean | null>(null);
  // Vacío = se calcula sola con la configuración de la billetera.
  const [comisionTexto, setComisionTexto] = useState('');
  // Dividir el gasto con otras personas (lo de ellas queda como préstamo).
  const [dividir, setDividir] = useState(false);
  // Pagué con Cashea: en vez de un gasto se registra una compra a cuotas.
  const [cashea, setCashea] = useState(false);
  // Foto del comprobante (ruta local) y si se está viendo en grande.
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [verComprobante, setVerComprobante] = useState(false);
  const [partes, setPartes] = useState<{ persona: string; montoTexto: string }[]>([{ persona: '', montoTexto: '' }]);
  const { tasas, referencia } = useTasas();
  // Pago Móvil desde bolívares: a persona o a comercio (null = según la billetera); 'OTRA' = monto a mano.
  const [destinoPago, setDestinoPago] = useState<DestinoPago | 'OTRA' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const [todas, cats] = await Promise.all([
        listarBilleteras(db, { incluirArchivadas: true }),
        listarCategorias(db, undefined, { incluirArchivadas: true }),
      ]);
      setCategorias(cats);

      if (id === undefined) {
        const activas = todas.filter((b) => !b.archivada);
        setBilleteras(activas);
        // Por defecto, la billetera indicada o la del último movimiento registrado.
        const [ultimo] = await listarMovimientos(db, { limite: 1 });
        const preferida = [billeteraInicial, ultimo?.billetera_origen_id].find((bid) =>
          activas.some((b) => b.id === bid),
        );
        setOrigenId(preferida ?? activas[0]?.id ?? null);
        if (montoInicial) setMontoTexto(centimosATexto(montoInicial));
        if (categoriaInicial) setCategoriaId(categoriaInicial);
        if (notaInicial) setNota(notaInicial);
        setCargando(false);
        return;
      }

      const m = await obtenerMovimiento(db, id);
      if (!m) {
        Alert.alert('No encontrado', 'Este movimiento ya no existe.');
        router.back();
        return;
      }
      // Se muestran las activas más las archivadas que use este movimiento.
      setBilleteras(
        todas.filter((b) => !b.archivada || b.id === m.billetera_origen_id || b.id === m.billetera_destino_id),
      );
      setOriginal(m);
      if (m.tipo === 'GASTO' || m.tipo === 'INGRESO' || m.tipo === 'TRANSFERENCIA') setTipo(m.tipo);
      setMontoTexto(centimosATexto(m.monto));
      setOrigenId(m.billetera_origen_id);
      setDestinoId(m.billetera_destino_id);
      setCategoriaId(m.categoria_id);
      if (m.monto_destino !== null) setRecibidoTexto(centimosATexto(m.monto_destino));
      if (m.tasa_cambio !== null) setTasaTexto(tasaATexto(m.tasa_cambio));
      setFecha(new Date(m.fecha));
      setNota(m.nota ?? '');
      setComprobante(m.comprobante);
      setUsarComision(m.comision !== null);
      if (m.comision !== null) {
        setComisionTexto(centimosATexto(m.comision));
        setDestinoPago('OTRA');
      }
      setCargando(false);
    })().catch((e) => Alert.alert('Error', String(e)));
  }, [db, id, billeteraInicial, montoInicial, categoriaInicial, notaInicial]);

  // Al volver de crear una categoría desde aquí, aparece en la lista.
  useFocusEffect(
    useCallback(() => {
      listarCategorias(db, undefined, { incluirArchivadas: true }).then(setCategorias).catch(() => {});
    }, [db]),
  );

  const origen = billeteras.find((b) => b.id === origenId) ?? null;
  const destino = billeteras.find((b) => b.id === destinoId) ?? null;
  const esTransferencia = tipo === 'TRANSFERENCIA';
  const conCambio = esTransferencia && origen && destino && origen.moneda !== destino.moneda;
  const monto = parsearMonto(montoTexto);
  // Entre USD y USDT la tasa por defecto es 1 (se consideran equivalentes); con Bs. hay que escribirla.
  const tasaPorDefecto = origen && destino && equivalentes(origen.moneda, destino.moneda) ? 1 : null;
  const tasa = parsearTasa(tasaTexto) ?? tasaPorDefecto;
  const recibido =
    recibidoTexto.trim() !== ''
      ? parsearMonto(recibidoTexto)
      : conCambio && monto && monto > 0 && tasa
        ? recibidoConTasa(origen.moneda, destino.moneda, monto, tasa)
        : null;

  const cambiarMonto = (t: string) => {
    setMontoTexto(t);
    // Si hay una tasa escrita, manda ella: se recalcula lo recibido.
    const nuevo = parsearMonto(t);
    const escrita = parsearTasa(tasaTexto) ?? tasaPorDefecto;
    if (conCambio && nuevo && nuevo > 0 && escrita) {
      setRecibidoTexto(centimosATexto(recibidoConTasa(origen.moneda, destino.moneda, nuevo, escrita)));
    } else if (!escrita) {
      setRecibidoTexto('');
    }
  };

  const cambiarTasa = (t: string) => {
    setTasaTexto(t);
    const nueva = parsearTasa(t);
    if (!origen || !destino || !nueva) return;
    const r = parsearMonto(recibidoTexto);
    if (monto && monto > 0) setRecibidoTexto(centimosATexto(recibidoConTasa(origen.moneda, destino.moneda, monto, nueva)));
    else if (r && r > 0) setMontoTexto(centimosATexto(enviadoConTasa(origen.moneda, destino.moneda, r, nueva)));
  };

  // Funciona en los dos sentidos: con una tasa, escribir lo recibido calcula lo enviado;
  // sin tasa, escribir los dos montos calcula la tasa.
  const cambiarRecibido = (t: string) => {
    setRecibidoTexto(t);
    const r = parsearMonto(t);
    if (!origen || !destino || !r || r <= 0) return;
    const tasaActual = parsearTasa(tasaTexto) ?? tasaPorDefecto;
    if (tasaActual) setMontoTexto(centimosATexto(enviadoConTasa(origen.moneda, destino.moneda, r, tasaActual)));
    else if (monto && monto > 0) setTasaTexto(tasaATexto(calcularTasa(origen.moneda, destino.moneda, monto, r)));
  };

  // Con otro par de monedas, la tasa y lo recibido que se habían escrito ya no aplican.
  const reiniciarCambio = () => {
    setTasaTexto('');
    setRecibidoTexto('');
  };

  const cambiarOrigen = (bid: number) => {
    setOrigenId(bid);
    if (bid === destinoId) setDestinoId(null);
    if (billeteras.find((b) => b.id === bid)?.moneda !== origen?.moneda) reiniciarCambio();
  };

  const cambiarDestino = (bid: number) => {
    setDestinoId(bid);
    if (billeteras.find((b) => b.id === bid)?.moneda !== destino?.moneda) reiniciarCambio();
  };

  const cambiarTipo = (t: TipoMovimiento) => {
    setTipo(t);
    if (categorias.find((c) => c.id === categoriaId)?.tipo !== t) setCategoriaId(null);
    setError(null);
  };

  const elegirFecha = (modo: 'date' | 'time') => {
    DateTimePickerAndroid.open({
      value: fecha,
      mode: modo,
      is24Hour: true,
      maximumDate: modo === 'date' ? new Date() : undefined,
      onChange: (evento, elegida) => {
        if (evento.type !== 'set' || !elegida) return;
        const nueva = new Date(fecha);
        if (modo === 'date') nueva.setFullYear(elegida.getFullYear(), elegida.getMonth(), elegida.getDate());
        else nueva.setHours(elegida.getHours(), elegida.getMinutes(), 0, 0);
        setFecha(nueva);
      },
    });
  };

  // Comisión bancaria (Pago Móvil): se propone según la billetera de origen.
  const configBilletera = {
    porcentaje: origen?.comision_porcentaje ?? 0,
    minima: origen?.comision_minima ?? 0,
  };
  const admiteComision = tipo !== 'INGRESO' && origen !== null && original?.comision_de == null;
  // En bolívares se elige a quién se paga y la comisión se calcula sola; en otras monedas, a mano.
  const pagoMovil = origen?.moneda === 'BS';
  const aQuien = pagoMovil ? (destinoPago ?? destinoPorDefecto(configBilletera)) : 'OTRA';
  const configComision = aQuien === 'OTRA' ? configBilletera : comisionPara(aQuien, configBilletera);
  const comisionActiva = admiteComision && (usarComision ?? tieneComision(configBilletera));
  const comisionAuto = monto && monto > 0 ? calcularComision(monto, configComision) : 0;
  const aMano = aQuien === 'OTRA' && comisionTexto.trim() !== '';
  const comision = !comisionActiva ? 0 : aMano ? parsearMonto(comisionTexto) : comisionAuto;

  const usaCashea = !editando && tipo === 'GASTO' && cashea;
  const dividiendo = !editando && tipo === 'GASTO' && dividir && !cashea;
  const deOtros = partes.reduce((suma, p) => suma + (parsearMonto(p.montoTexto) ?? 0), 0);
  const tuParte = monto !== null && monto > 0 ? monto - deOtros : null;

  /** Guarda billetera, categoría y monto como un botón de Inicio para registrarlo con un toque. */
  const guardarComoRapido = async () => {
    if (!origenId || !categoriaId || tipo === 'TRANSFERENCIA') {
      setError('Elige la billetera y la categoría primero.');
      return;
    }
    const nombre = nota.trim() || categorias.find((c) => c.id === categoriaId)?.nombre || 'Rápido';
    try {
      await crearPlantilla(db, { nombre: nombre.slice(0, 24), tipo, monto: monto && monto > 0 ? monto : null, billetera_id: origenId, categoria_id: categoriaId });
      Alert.alert('Listo', `"${nombre.slice(0, 24)}" aparece en Inicio, en Movimientos rápidos. Déjalo presionado para borrarlo.`);
    } catch (e) {
      setError(e instanceof ErrorValidacion ? e.message : String(e));
    }
  };

  const adjuntar = async (origen: 'camara' | 'galeria') => {
    try {
      const uri = await elegirComprobante(origen);
      if (uri) setComprobante(uri);
    } catch (e) {
      Alert.alert('Comprobante', e instanceof Error ? e.message : String(e));
    }
  };

  /** Pasa a "Nueva compra a cuotas" con lo ya escrito (el total en dólares a tasa BCV, la de Cashea). */
  const seguirEnCashea = () => {
    const usd = monto && monto > 0 && origen ? convertir(monto, origen.moneda, 'USD', cambioDe(tasas, 'BCV')) : null;
    router.replace({
      pathname: '/cuota/nueva',
      params: {
        total: usd ? String(usd) : '',
        categoria: categoriaId ? String(categoriaId) : '',
        descripcion: nota.trim(),
        billetera: origenId ? String(origenId) : '',
        // La comisión se calcula en el siguiente paso sobre lo que de verdad sale (la inicial).
        comision: !comisionActiva ? 'NO' : aQuien === 'OTRA' ? '' : aQuien,
      },
    });
  };

  const guardar = async () => {
    if (usaCashea) {
      seguirEnCashea();
      return;
    }
    if (!monto || monto <= 0) {
      setError('Escribe un monto mayor que cero.');
      return;
    }
    if (!origenId) {
      setError('Elige una billetera.');
      return;
    }
    if (conCambio && (!recibido || recibido <= 0)) {
      setError('Indica cuánto recibiste o la tasa pactada.');
      return;
    }
    if (comisionActiva && (comision === null || comision < 0)) {
      setError('El monto de la comisión no es válido.');
      return;
    }
    setGuardando(true);
    setError(null);
    const datos = {
      tipo,
      monto,
      fecha: fecha.toISOString(),
      billetera_origen_id: origenId,
      categoria_id: esTransferencia ? null : categoriaId,
      billetera_destino_id: esTransferencia ? destinoId : null,
      monto_destino: conCambio ? recibido : null,
      nota,
      // Una comisión (hija de otro movimiento) no lleva comisión propia.
      comision: original?.comision_de != null ? undefined : comision || 0,
      comprobante,
    };
    try {
      if (id === undefined && dividiendo) {
        const lista: ParteDivision[] = partes.map((p) => ({ persona: p.persona, monto: parsearMonto(p.montoTexto) ?? 0 }));
        await dividirGasto(db, { ...datos, categoria_id: categoriaId }, lista, tasas[referencia]?.tasa ?? null);
      } else if (id === undefined) await crearMovimiento(db, datos);
      else await actualizarMovimiento(db, id, datos);
      router.back();
    } catch (e) {
      if (e instanceof ErrorValidacion) setError(e.message);
      else Alert.alert('Error', String(e));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = () => {
    if (id === undefined) return;
    Alert.alert('¿Eliminar movimiento?', 'Los saldos se recalcularán.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarMovimiento(db, id);
            router.back();
          } catch (e) {
            Alert.alert('No se pudo eliminar', e instanceof ErrorValidacion ? e.message : String(e));
          }
        },
      },
    ]);
  };

  if (cargando) return <ActivityIndicator style={styles.cargando} />;

  const titulo = editando ? 'Editar movimiento' : 'Nuevo movimiento';

  if (original?.meta_id != null) {
    return (
      <View style={styles.contenido}>
        <Stack.Screen options={{ title: titulo }} />
        <Text variant="bodyLarge">
          {`${original.tipo === 'APORTE_META' ? 'Aporte a' : 'Retiro de'} la meta "${original.meta_nombre}": ${formatearMonto(original.monto, original.origen_moneda)} ${original.tipo === 'APORTE_META' ? 'desde' : 'hacia'} ${original.origen_nombre}.`}
        </Text>
        <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
          Los movimientos de metas no se editan; si te equivocaste, elimínalo y regístralo de nuevo desde Ahorros.
        </Text>
        <Button mode="text" icon="delete" textColor={tema.colors.error} onPress={confirmarEliminar}>
          Eliminar movimiento
        </Button>
      </View>
    );
  }

  if (original?.deuda_id != null) {
    const entra = original.tipo === 'PRESTAMO_RECIBIDO' || original.tipo === 'COBRO_DEUDA';
    return (
      <View style={styles.contenido}>
        <Stack.Screen options={{ title: titulo }} />
        <Text variant="bodyLarge">
          {`${formatearMonto(original.monto, original.origen_moneda)} ${entra ? 'entraron a' : 'salieron de'} ${original.origen_nombre} ${original.deuda_ajeno ? 'con el dinero de' : 'por la deuda con'} ${original.deuda_persona}.`}
        </Text>
        <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
          {original.deuda_ajeno
            ? 'Se gestiona desde el dinero de esa persona; si te equivocaste, elimínalo y regístralo de nuevo.'
            : 'Los movimientos de deudas se gestionan desde la deuda; si te equivocaste, elimínalo y regístralo de nuevo.'}
        </Text>
        <Button mode="outlined" icon={original.deuda_ajeno ? 'account-cash' : 'handshake'} onPress={() => router.replace(`/deuda/${original.deuda_id}`)}>
          {original.deuda_ajeno ? `Ver el dinero de ${original.deuda_persona}` : 'Ver la deuda'}
        </Button>
        <Button mode="text" icon="delete" textColor={tema.colors.error} onPress={confirmarEliminar}>
          Eliminar movimiento
        </Button>
      </View>
    );
  }

  if (billeteras.length === 0) {
    return (
      <View style={styles.contenido}>
        <Stack.Screen options={{ title: titulo }} />
        <Text variant="bodyLarge">Primero crea una billetera.</Text>
        <Button mode="contained" onPress={() => router.replace('/billetera/nueva')}>
          Crear billetera
        </Button>
      </View>
    );
  }

  // Las archivadas no se ofrecen, salvo la que ya tenga el movimiento que se edita.
  const categoriasTipo = categorias.filter((c) => c.tipo === tipo && (!c.archivada || c.id === categoriaId));
  // Aviso (no bloquea) si un movimiento nuevo deja la billetera en negativo.
  const quedaNegativo =
    !editando && tipo !== 'INGRESO' && origen && monto && monto > 0 && origen.saldo - monto - (comision ?? 0) < 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: titulo }} />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <SegmentedButtons
          value={tipo}
          onValueChange={(v) => cambiarTipo(v as TipoMovimiento)}
          buttons={TIPOS.map((t) => ({
            ...t,
            showSelectedCheck: false,
            checkedColor: '#FFFFFF',
            uncheckedColor: COLOR_TIPO[t.value],
            style: tipo === t.value ? { backgroundColor: COLOR_TIPO[t.value] } : undefined,
          }))}
        />

        <View>
          <TextInput
            label={esTransferencia ? 'Monto enviado' : 'Monto'}
            activeOutlineColor={COLOR_TIPO[tipo]}
            value={montoTexto}
            onChangeText={cambiarMonto}
            keyboardType="decimal-pad"
            placeholder="0,00"
            mode="outlined"
            autoFocus={!editando}
            style={styles.monto}
            right={origen ? <TextInput.Affix text={INFO_MONEDA[origen.moneda].corto} /> : undefined}
          />
          {monto === null && montoTexto.trim() !== '' ? (
            <HelperText type="error">Número no válido</HelperText>
          ) : quedaNegativo ? (
            <HelperText type="info" style={{ color: tema.colors.error }}>
              {`${origen.nombre} quedará en ${formatearMonto(origen.saldo - monto - (comision ?? 0), origen.moneda)}`}
            </HelperText>
          ) : origen && monto ? (
            <HelperText type="info">{formatearMonto(monto, origen.moneda)}</HelperText>
          ) : null}
        </View>

        <View style={styles.bloque}>
          <Text variant="labelLarge">
            {tipo === 'INGRESO' ? 'Entra a' : esTransferencia ? 'Desde' : 'Sale de'}
          </Text>
          <SelectorBilletera billeteras={billeteras} valor={origenId} onCambio={cambiarOrigen} />
          {origen && (
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              {`Saldo: ${formatearMonto(origen.saldo, origen.moneda)}`}
            </Text>
          )}
        </View>

        {esTransferencia ? (
          <>
            <View style={styles.bloque}>
              <Text variant="labelLarge">Hacia</Text>
              {!destino && (
                <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                  Para comprar dólares: desde el banco (Bs.) hacia Efectivo o Binance. Para vender, al revés.
                </Text>
              )}
              <SelectorBilletera
                billeteras={billeteras}
                valor={destinoId}
                onCambio={cambiarDestino}
                excluir={origenId}
              />
            </View>
            {conCambio && (
              <View style={styles.filaCampos}>
                <TextInput
                  label={`Tasa (${unidadTasa(origen.moneda, destino.moneda)})`}
                  value={tasaTexto}
                  placeholder={tasaPorDefecto ? '1' : undefined}
                  onChangeText={cambiarTasa}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  style={styles.flex}
                />
                <TextInput
                  label="Recibido"
                  value={recibidoTexto}
                  placeholder={recibido ? centimosATexto(recibido) : undefined}
                  onChangeText={cambiarRecibido}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  style={styles.flex}
                  right={<TextInput.Affix text={INFO_MONEDA[destino.moneda].corto} />}
                />
              </View>
            )}
            {conCambio && (
              <SugerenciasTasa de={origen.moneda} a={destino.moneda} billeteras={[origen, destino]} onElegir={cambiarTasa} />
            )}
            {conCambio && recibido !== null && recibido > 0 && (
              <HelperText type="info">
                {`${destino.nombre} recibe ${formatearMonto(recibido, destino.moneda)}.`}
              </HelperText>
            )}
          </>
        ) : (
          <View style={styles.bloque}>
            <Text variant="labelLarge">Categoría</Text>
            <View style={styles.chips}>
              {categoriasTipo.map((c) => {
                const elegida = c.id === categoriaId;
                return (
                  <Chip
                    key={c.id}
                    icon={c.icono}
                    selected={elegida}
                    showSelectedCheck={false}
                    mode={elegida ? 'flat' : 'outlined'}
                    onPress={() => setCategoriaId(c.id)}
                    style={elegida ? { backgroundColor: c.color_hex } : undefined}
                    textStyle={elegida ? styles.textoElegido : undefined}
                    selectedColor={elegida ? '#FFFFFF' : undefined}
                  >
                    {c.nombre}
                  </Chip>
                );
              })}
              <Chip
                icon="plus"
                mode="outlined"
                onPress={() => router.push({ pathname: '/categoria/nueva', params: { tipo } })}
              >
                Nueva
              </Chip>
            </View>
          </View>
        )}

        {!editando && tipo === 'GASTO' && (
          <View style={styles.filaSwitch}>
            <View style={styles.flex}>
              <Text variant="labelLarge">Pagué con Cashea</Text>
              <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                {cashea
                  ? 'Escribe el precio total de la compra. Al tocar "Seguir en Cashea" eliges la inicial (sale de la billetera elegida) y las cuotas.'
                  : 'Se registra como compra a cuotas en vez de un gasto normal.'}
              </Text>
            </View>
            <Switch value={cashea} onValueChange={setCashea} accessibilityLabel="Pagué con Cashea" />
          </View>
        )}

        {!editando && tipo === 'GASTO' && origen && !cashea && (
          <View style={styles.bloque}>
            <View style={styles.filaSwitch}>
              <View style={styles.flex}>
                <Text variant="labelLarge">Dividir con otras personas</Text>
                <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                  Tu parte queda como gasto y la de cada uno como algo que te debe.
                </Text>
              </View>
              <Switch value={dividir} onValueChange={setDividir} accessibilityLabel="Dividir el gasto" />
            </View>
            {dividir && (
              <>
                {partes.map((p, i) => (
                  <View key={i} style={styles.filaCampos}>
                    <TextInput
                      label="Persona"
                      value={p.persona}
                      onChangeText={(t) => setPartes((l) => l.map((x, j) => (j === i ? { ...x, persona: t } : x)))}
                      mode="outlined"
                      dense
                      style={styles.flex}
                    />
                    <TextInput
                      label="Su parte"
                      value={p.montoTexto}
                      onChangeText={(t) => setPartes((l) => l.map((x, j) => (j === i ? { ...x, montoTexto: t } : x)))}
                      keyboardType="decimal-pad"
                      mode="outlined"
                      dense
                      style={styles.flex}
                      right={<TextInput.Affix text={INFO_MONEDA[origen.moneda].corto} />}
                    />
                    {partes.length > 1 && (
                      <IconButton icon="close" accessibilityLabel="Quitar persona" onPress={() => setPartes((l) => l.filter((_, j) => j !== i))} />
                    )}
                  </View>
                ))}
                <View style={styles.chips}>
                  <Chip compact icon="account-plus" onPress={() => setPartes((l) => [...l, { persona: '', montoTexto: '' }])}>
                    Otra persona
                  </Chip>
                  <Chip
                    compact
                    icon="division"
                    onPress={() => {
                      if (!monto || monto <= 0) return;
                      const { cadaUno } = partesIguales(monto, partes.length);
                      setPartes((l) => l.map((x) => ({ ...x, montoTexto: centimosATexto(cadaUno) })));
                    }}
                  >
                    Partes iguales
                  </Chip>
                </View>
                {monto !== null && monto > 0 && (
                  <HelperText type={tuParte !== null && tuParte > 0 ? 'info' : 'error'}>
                    {tuParte !== null && tuParte > 0
                      ? `Tu parte: ${formatearMonto(tuParte, origen.moneda)}. Sale de ${origen.nombre}: ${formatearMonto(monto, origen.moneda)}.`
                      : 'Las partes de los demás no pueden sumar el total.'}
                  </HelperText>
                )}
              </>
            )}
          </View>
        )}

        {admiteComision && origen && (
          <View style={styles.bloque}>
            <View style={styles.filaSwitch}>
              <View style={styles.flex}>
                <Text variant="labelLarge">Comisión bancaria</Text>
                <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                  {comisionActiva && usaCashea
                    ? 'Se calcula sobre la inicial que pagues, en el siguiente paso'
                    : comisionActiva
                    ? `${formatearMonto(comision ?? 0, origen.moneda)} · se registra aparte en "Comisiones"`
                    : tieneComision(configComision)
                      ? `Desactivada (${origen.nombre}: ${describirComision(configComision, (c) => formatearMonto(c, origen.moneda))})`
                      : 'Sin comisión'}
                </Text>
              </View>
              <Switch
                value={comisionActiva}
                onValueChange={(v) => setUsarComision(v)}
                accessibilityLabel="Cobrar comisión bancaria"
              />
            </View>
            {comisionActiva && pagoMovil && (
              <View style={styles.chips}>
                {(
                  [
                    ['PERSONA', 'A persona'],
                    ['COMERCIO', 'A comercio'],
                    ['OTRA', 'Otro monto'],
                  ] as const
                ).filter(([valor]) => !usaCashea || valor !== 'OTRA').map(([valor, texto]) => {
                  const cfg = valor === 'OTRA' ? null : comisionPara(valor, configBilletera);
                  return (
                    <Chip
                      key={valor}
                      compact
                      selected={aQuien === valor}
                      showSelectedCheck
                      mode={aQuien === valor ? 'flat' : 'outlined'}
                      onPress={() => setDestinoPago(valor)}
                    >
                      {cfg ? `${texto} · ${String(cfg.porcentaje).replace('.', ',')} %` : texto}
                    </Chip>
                  );
                })}
              </View>
            )}
            {comisionActiva && aQuien === 'OTRA' && !usaCashea && (
              <TextInput
                label="Monto de la comisión"
                value={comisionTexto}
                onChangeText={setComisionTexto}
                placeholder={comisionAuto ? centimosATexto(comisionAuto) : undefined}
                keyboardType="decimal-pad"
                mode="outlined"
                dense
                right={<TextInput.Affix text={INFO_MONEDA[origen.moneda].corto} />}
              />
            )}
            {comisionActiva && !aMano && !usaCashea && (
              <HelperText type="info">
                {tieneComision(configComision)
                  ? `Calculada: ${describirComision(configComision, (c) => formatearMonto(c, origen.moneda))}.${aQuien === 'OTRA' ? ' Escribe otro monto si tu banco cobró distinto.' : ''}`
                  : 'Escribe cuánto te cobró el banco. Puedes configurar la comisión en la billetera.'}
              </HelperText>
            )}
            {comisionActiva && !usaCashea && monto !== null && monto > 0 && comision !== null && comision > 0 && (
              <Text variant="bodyMedium">
                {`Total que sale: ${formatearMonto(monto + comision, origen.moneda)} (${formatearMonto(monto, origen.moneda)} + ${formatearMonto(comision, origen.moneda)} de comisión)`}
              </Text>
            )}
          </View>
        )}

        <View style={styles.filaCampos}>
          <Button mode="outlined" icon="calendar" onPress={() => elegirFecha('date')} style={styles.flex}>
            {formatearFechaCorta(fecha)}
          </Button>
          <Button mode="outlined" icon="clock-outline" onPress={() => elegirFecha('time')}>
            {formatearHora(fecha.toISOString())}
          </Button>
        </View>

        <View style={styles.bloque}>
          <Text variant="labelLarge">Comprobante (opcional)</Text>
          {comprobante ? (
            <View style={styles.filaCampos}>
              <Pressable onPress={() => setVerComprobante(true)} accessibilityRole="imagebutton" accessibilityLabel="Ver comprobante">
                <Image source={{ uri: comprobante }} style={styles.miniatura} />
              </Pressable>
              <Button icon="close" onPress={() => setComprobante(null)}>
                Quitar
              </Button>
            </View>
          ) : (
            <View style={styles.filaCampos}>
              <Button mode="outlined" icon="camera" onPress={() => adjuntar('camara')}>
                Foto
              </Button>
              <Button mode="outlined" icon="image" onPress={() => adjuntar('galeria')}>
                Galería
              </Button>
            </View>
          )}
        </View>
        <Portal>
          <Modal visible={verComprobante} onDismiss={() => setVerComprobante(false)} contentContainerStyle={styles.modal}>
            {comprobante && <Image source={{ uri: comprobante }} style={styles.imagenGrande} resizeMode="contain" />}
          </Modal>
        </Portal>

        <TextInput
          label="Nota (opcional)"
          value={nota}
          onChangeText={setNota}
          maxLength={LARGO_MAXIMO_NOTA}
          mode="outlined"
          multiline
        />

        {error && <HelperText type="error">{error}</HelperText>}

        {!editando && tipo !== 'TRANSFERENCIA' && !usaCashea && (
          <Button mode="text" icon="lightning-bolt" onPress={guardarComoRapido}>
            Guardar como movimiento rápido
          </Button>
        )}
        <Button
          mode="contained"
          buttonColor={COLOR_TIPO[tipo]}
          textColor="#FFFFFF"
          icon={usaCashea ? 'cart-arrow-right' : undefined}
          onPress={guardar}
          loading={guardando}
          disabled={guardando}
        >
          {usaCashea ? 'Seguir en Cashea' : 'Guardar'}
        </Button>
        {editando && (
          <Button mode="text" icon="delete" textColor={tema.colors.error} onPress={confirmarEliminar}>
            Eliminar movimiento
          </Button>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cargando: { marginTop: 48 },
  contenido: { padding: 16, gap: 16, paddingBottom: 48 },
  monto: { fontSize: 24 },
  bloque: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniatura: { width: 72, height: 72, borderRadius: 8 },
  modal: { margin: 16, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  imagenGrande: { width: '100%', height: 520 },
  filaCampos: { flexDirection: 'row', gap: 8 },
  textoElegido: { color: '#FFFFFF' },
  filaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
