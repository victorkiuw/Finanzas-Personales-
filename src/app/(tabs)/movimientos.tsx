import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { FAB, Searchbar } from 'react-native-paper';

import { ListaMovimientos } from '../../components/ListaMovimientos';
import { MenuFiltro } from '../../components/MenuFiltro';
import { listarBilleteras, type Billetera } from '../../db/billeteras';
import { listarCategorias, type Categoria } from '../../db/categorias';
import type { TipoTransaccion } from '../../db/movimientos';
import { formatearFechaCorta, nombreMes, rangoDias, rangoMes } from '../../lib/fechas';

type Periodo = 'MES' | 'MES_PASADO' | 'SEMANA' | 'PERSONALIZADO';

interface Rango {
  desde: string;
  hasta: string;
  etiqueta: string;
}

function rangoPeriodo(p: Exclude<Periodo, 'PERSONALIZADO'>): Rango {
  const hoy = new Date();
  if (p === 'SEMANA') {
    const inicio = new Date(hoy);
    inicio.setDate(inicio.getDate() - 6);
    return { ...rangoDias(inicio, hoy), etiqueta: 'Últimos 7 días' };
  }
  const delta = p === 'MES' ? 0 : -1;
  const mes = new Date(hoy.getFullYear(), hoy.getMonth() + delta, 1);
  return { ...rangoMes(hoy, delta), etiqueta: nombreMes(mes) };
}

/** Abre el selector de fecha de Android y resuelve con la fecha elegida o null si se cancela. */
function pedirFecha(valor: Date, titulo: string, minimo?: Date): Promise<Date | null> {
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: valor,
      mode: 'date',
      title: titulo,
      minimumDate: minimo,
      maximumDate: new Date(),
      onChange: (e, d) => resolve(e.type === 'set' && d ? d : null),
    });
  });
}

export default function PantallaMovimientos() {
  const db = useSQLiteContext();
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [periodo, setPeriodo] = useState<Periodo | undefined>();
  const [rango, setRango] = useState<Rango | undefined>();
  const [billeteraId, setBilleteraId] = useState<number | undefined>();
  const [tipo, setTipo] = useState<TipoTransaccion | undefined>();
  const [categoriaId, setCategoriaId] = useState<number | undefined>();
  const [busqueda, setBusqueda] = useState('');
  // Se espera a que se deje de escribir para no consultar en cada tecla.
  const [texto, setTexto] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTexto(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([listarBilleteras(db, { incluirArchivadas: true }), listarCategorias(db, undefined, { incluirArchivadas: true })])
        .then(([b, c]) => {
          setBilleteras(b);
          setCategorias(c);
        })
        .catch((e) => Alert.alert('Error', String(e)));
    }, [db]),
  );

  const cambiarPeriodo = async (p: Periodo | undefined) => {
    if (p === undefined) {
      setPeriodo(undefined);
      setRango(undefined);
      return;
    }
    if (p !== 'PERSONALIZADO') {
      setPeriodo(p);
      setRango(rangoPeriodo(p));
      return;
    }
    const desde = await pedirFecha(new Date(), 'Desde');
    if (!desde) return;
    const hasta = await pedirFecha(new Date(), 'Hasta', desde);
    if (!hasta) return;
    setPeriodo('PERSONALIZADO');
    setRango({ ...rangoDias(desde, hasta), etiqueta: `${formatearFechaCorta(desde)} – ${formatearFechaCorta(hasta)}` });
  };

  const cambiarTipo = (t: TipoTransaccion | undefined) => {
    setTipo(t);
    // Una categoría de gasto no tiene sentido con el filtro de ingresos, y viceversa.
    if (t && categorias.find((c) => c.id === categoriaId)?.tipo !== t) setCategoriaId(undefined);
  };

  const categoriasVisibles = categorias.filter((c) => !tipo || tipo === c.tipo);

  const filtros = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.barraFiltros}
      contentContainerStyle={styles.filtros}
    >
      <MenuFiltro
        etiqueta="Periodo"
        icono="calendar"
        valor={periodo}
        etiquetaValor={rango?.etiqueta}
        onCambio={cambiarPeriodo}
        opciones={[
          { valor: 'MES', etiqueta: 'Este mes' },
          { valor: 'MES_PASADO', etiqueta: 'Mes pasado' },
          { valor: 'SEMANA', etiqueta: 'Últimos 7 días' },
          { valor: 'PERSONALIZADO', etiqueta: 'Elegir fechas…' },
        ]}
      />
      <MenuFiltro
        etiqueta="Billetera"
        icono="wallet"
        valor={billeteraId}
        onCambio={setBilleteraId}
        opciones={billeteras.map((b) => ({ valor: b.id, etiqueta: b.nombre, icono: b.icono }))}
      />
      <MenuFiltro
        etiqueta="Tipo"
        icono="filter-variant"
        valor={tipo}
        onCambio={cambiarTipo}
        opciones={[
          { valor: 'GASTO', etiqueta: 'Gastos', icono: 'arrow-up' },
          { valor: 'INGRESO', etiqueta: 'Ingresos', icono: 'arrow-down' },
          { valor: 'TRANSFERENCIA', etiqueta: 'Transferencias', icono: 'swap-horizontal' },
        ]}
      />
      {tipo !== 'TRANSFERENCIA' && (
        <MenuFiltro
          etiqueta="Categoría"
          icono="tag"
          valor={categoriaId}
          onCambio={setCategoriaId}
          opciones={categoriasVisibles.map((c) => ({ valor: c.id, etiqueta: c.nombre, icono: c.icono }))}
        />
      )}
    </ScrollView>
  );

  return (
    <View style={styles.flex}>
      <Searchbar
        placeholder="Buscar nota, categoría, persona o monto"
        value={busqueda}
        onChangeText={setBusqueda}
        style={styles.buscador}
        inputStyle={styles.textoBuscador}
      />
      {filtros}
      <ListaMovimientos
        filtro={{ billeteraId, tipo, categoriaId, desde: rango?.desde, hasta: rango?.hasta, texto: texto || undefined }}
        textoVacio={
          billeteras.length === 0
            ? 'Crea una billetera para empezar a registrar movimientos.'
            : 'No hay movimientos con estos filtros.'
        }
      />
      {billeteras.some((b) => !b.archivada) && (
        <FAB icon="plus" label="Movimiento" style={styles.fab} onPress={() => router.push('/movimiento/nuevo')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  barraFiltros: { flexGrow: 0 },
  buscador: { marginHorizontal: 16, marginTop: 8 },
  textoBuscador: { minHeight: 0 },
  filtros: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
