import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Badge, FAB, IconButton, Searchbar, Text, useTheme } from 'react-native-paper';

import { BotonFlotante } from '../../components/BotonFlotante';
import { CalendarioMes } from '../../components/CalendarioMes';
import { DeslizarMes } from '../../components/DeslizarMes';
import { DialogoDictado } from '../../components/DialogoDictado';
import { COLOR_GASTO, COLOR_GASTO_OSCURO, COLOR_INGRESO, COLOR_INGRESO_OSCURO } from '../../components/ItemMovimiento';
import { ListaMovimientos } from '../../components/ListaMovimientos';
import { MenuFiltro } from '../../components/MenuFiltro';
import { Pastilla } from '../../components/ResumenSaldo';
import { SelectorMes } from '../../components/SelectorMes';
import { TarjetasFlujo } from '../../components/TarjetasFlujo';
import { useTasas } from '../../components/TasasProvider';
import { useConversor } from '../../components/useConversor';
import { listarBilleteras, type Billetera } from '../../db/billeteras';
import { listarCategorias, type Categoria } from '../../db/categorias';
import type { TipoTransaccion } from '../../db/movimientos';
import { filasDeReporte, totalesPorDia, totalesPorMes, type FilaReporte } from '../../db/reportes';
import { rangoDias, rangoMes } from '../../lib/fechas';
import { formatearMonto } from '../../lib/moneda';

type Vista = 'LISTA' | 'CALENDARIO' | 'ANIO';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Rango [desde, hasta) del día "AAAA-MM-DD" local. */
function rangoDelDia(dia: string) {
  const [a, m, d] = dia.split('-').map(Number);
  const fecha = new Date(a, m - 1, d);
  return rangoDias(fecha, fecha);
}

export default function PantallaMovimientos() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { monedaBase } = useTasas();
  const conversor = useConversor();
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [vista, setVista] = useState<Vista>('LISTA');
  const [mes, setMes] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [dia, setDia] = useState<string | null>(null);
  const [verFiltros, setVerFiltros] = useState(false);
  const [dictando, setDictando] = useState(false);
  // Sube al jalar hacia abajo para volver a leer los totales.
  const [version, setVersion] = useState(0);
  const [billeteraId, setBilleteraId] = useState<number | undefined>();
  const [tipo, setTipo] = useState<TipoTransaccion | undefined>();
  const [categoriaId, setCategoriaId] = useState<number | undefined>();
  const [filas, setFilas] = useState<FilaReporte[]>([]);
  const [filasAnio, setFilasAnio] = useState<FilaReporte[]>([]);
  const [busqueda, setBusqueda] = useState('');
  // Se espera a que se deje de escribir para no consultar en cada tecla.
  const [texto, setTexto] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTexto(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const rango = rangoMes(mes);
  const filtroReporte = useMemo(
    () => ({ billeteraId, categoriaId, tipo: tipo === 'GASTO' || tipo === 'INGRESO' ? tipo : undefined }),
    [billeteraId, categoriaId, tipo],
  );

  useFocusEffect(
    useCallback(() => {
      Promise.all([listarBilleteras(db, { incluirArchivadas: true }), listarCategorias(db, undefined, { incluirArchivadas: true })])
        .then(([b, c]) => {
          setBilleteras(b);
          setCategorias(c);
        })
        .catch((e) => Alert.alert('Error', String(e)));
      // Totales del mes (y del año en la vista anual) para las tarjetas, los días y el calendario.
      filasDeReporte(db, rango.desde, rango.hasta, filtroReporte)
        .then(setFilas)
        .catch(() => {});
      if (vista === 'ANIO') {
        filasDeReporte(db, new Date(anio, 0, 1).toISOString(), new Date(anio + 1, 0, 1).toISOString(), filtroReporte)
          .then(setFilasAnio)
          .catch(() => {});
      }
    }, [db, rango.desde, rango.hasta, filtroReporte, vista, anio, version]),
  );

  const sinTotales = tipo === 'TRANSFERENCIA';
  const porDia = useMemo(
    () => (conversor && !sinTotales ? totalesPorDia(filas, conversor, monedaBase) : new Map()),
    [filas, conversor, monedaBase, sinTotales],
  );
  const resumenMes = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;
    for (const t of porDia.values()) {
      ingresos += t.ingresos;
      gastos += t.gastos;
    }
    return { ingresos, gastos };
  }, [porDia]);
  const porMes = useMemo(() => {
    if (!conversor) return [];
    const claves = MESES.map((_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);
    return totalesPorMes(filasAnio, conversor, monedaBase, claves);
  }, [filasAnio, conversor, monedaBase, anio]);

  const cambiarTipo = (t: TipoTransaccion | undefined) => {
    setTipo(t);
    // Una categoría de gasto no tiene sentido con el filtro de ingresos, y viceversa.
    if (t && categorias.find((c) => c.id === categoriaId)?.tipo !== t) setCategoriaId(undefined);
  };
  const cambiarMes = (m: Date) => {
    setMes(m);
    setDia(null);
  };

  const categoriasVisibles = categorias.filter((c) => !tipo || tipo === c.tipo);
  const filtrosActivos = [billeteraId, tipo, categoriaId].filter((x) => x !== undefined).length;
  const buscando = texto !== '';

  const filtros = verFiltros && (
    <View style={styles.filtros}>
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
    </View>
  );

  const cabecera = (
    <View style={styles.cabecera}>
      <View style={styles.filaBuscar}>
        <Searchbar
          placeholder="Buscar movimiento…"
          value={busqueda}
          onChangeText={setBusqueda}
          style={[styles.buscador, { backgroundColor: tema.colors.surfaceVariant }]}
          inputStyle={styles.textoBuscador}
        />
        <View>
          <IconButton
            icon="filter-variant"
            mode="outlined"
            size={22}
            selected={verFiltros}
            accessibilityLabel="Filtros"
            onPress={() => setVerFiltros((v) => !v)}
            style={styles.botonFiltro}
          />
          {filtrosActivos > 0 && <Badge style={styles.badge}>{filtrosActivos}</Badge>}
        </View>
      </View>
      {filtros}
      {!buscando && (
        <View style={styles.vistas}>
          <Pastilla texto="Lista" elegida={vista === 'LISTA'} onPress={() => setVista('LISTA')} />
          <Pastilla texto="Calendario" elegida={vista === 'CALENDARIO'} onPress={() => setVista('CALENDARIO')} />
          <Pastilla texto="Año" elegida={vista === 'ANIO'} onPress={() => setVista('ANIO')} />
        </View>
      )}
    </View>
  );

  const hayBilleteras = billeteras.some((b) => !b.archivada);
  const fab = hayBilleteras && (
    <>
      <BotonFlotante onDictar={() => setDictando(true)} />
      <DialogoDictado visible={dictando} onCerrar={() => setDictando(false)} />
    </>
  );

  if (vista === 'ANIO' && !buscando) {
    const ingresosAnio = porMes.reduce((s, m) => s + m.ingresos, 0);
    const gastosAnio = porMes.reduce((s, m) => s + m.gastos, 0);
    const hoy = new Date();
    return (
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.contenidoAnio}>
          {cabecera}
          <View style={styles.seccion}>
            <View style={[styles.selectorAnio, { backgroundColor: tema.colors.surfaceVariant }]}>
              <IconButton icon="chevron-left" onPress={() => setAnio(anio - 1)} accessibilityLabel="Año anterior" />
              <Text variant="titleMedium" style={styles.anio}>
                {anio}
              </Text>
              <IconButton
                icon="chevron-right"
                onPress={() => setAnio(anio + 1)}
                disabled={anio >= hoy.getFullYear()}
                accessibilityLabel="Año siguiente"
              />
            </View>
            {!sinTotales && <TarjetasFlujo ingresos={ingresosAnio} gastos={gastosAnio} moneda={monedaBase} />}
            <View style={[styles.tablaAnio, { backgroundColor: tema.colors.surfaceVariant }]}>
              {porMes.map((m, i) => {
                const futuro = anio === hoy.getFullYear() && i > hoy.getMonth();
                if (futuro) return null;
                return (
                  <FilaMes
                    key={m.mes}
                    nombre={MESES[i]}
                    ingresos={m.ingresos}
                    gastos={m.gastos}
                    moneda={monedaBase}
                    onPress={() => {
                      cambiarMes(new Date(anio, i, 1));
                      setVista('LISTA');
                    }}
                  />
                );
              }).reverse()}
            </View>
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              Toca un mes para ver sus movimientos. No incluye transferencias ni metas.
            </Text>
          </View>
        </ScrollView>
        {fab}
      </View>
    );
  }

  const filtroLista = {
    billeteraId,
    tipo,
    categoriaId,
    texto: texto || undefined,
    // Buscando se busca en todo; si no, el mes elegido (o el día tocado en el calendario).
    ...(buscando ? {} : vista === 'CALENDARIO' && dia ? rangoDelDia(dia) : rango),
  };

  return (
    <View style={styles.flex}>
      <ListaMovimientos
        filtro={filtroLista}
        totalesDia={buscando ? undefined : porDia}
        onRefrescar={() => setVersion((v) => v + 1)}
        monedaTotales={monedaBase}
        encabezado={
          <View>
            {cabecera}
            <DeslizarMes mes={mes} onCambio={cambiarMes}>
            {!buscando && (
              <View style={styles.seccion}>
                <SelectorMes mes={mes} onCambio={cambiarMes} />
                {!sinTotales && (
                  <TarjetasFlujo
                    ingresos={resumenMes.ingresos}
                    gastos={resumenMes.gastos}
                    moneda={monedaBase}
                    conBalance={vista === 'LISTA'}
                  />
                )}
              </View>
            )}
            {!buscando && vista === 'CALENDARIO' && (
              <View style={styles.calendario}>
                <CalendarioMes mes={mes} totales={porDia} elegido={dia} onElegir={setDia} />
                <Text variant="bodySmall" style={[styles.ayuda, { color: tema.colors.onSurfaceVariant }]}>
                  {dia ? 'Abajo, los movimientos del día elegido. Tócalo de nuevo para ver todo el mes.' : 'Toca un día para ver solo sus movimientos.'}
                </Text>
              </View>
            )}
            </DeslizarMes>
          </View>
        }
        textoVacio={
          billeteras.length === 0
            ? 'Crea una billetera para empezar a registrar movimientos.'
            : buscando
              ? 'No se encontró ningún movimiento.'
              : dia && vista === 'CALENDARIO'
                ? 'No hay movimientos ese día.'
                : 'No hay movimientos en este mes.'
        }
      />
      {fab}
    </View>
  );
}

function FilaMes({
  nombre,
  ingresos,
  gastos,
  moneda,
  onPress,
}: {
  nombre: string;
  ingresos: number;
  gastos: number;
  moneda: Parameters<typeof formatearMonto>[1];
  onPress: () => void;
}) {
  const tema = useTheme();
  const verde = tema.dark ? COLOR_INGRESO_OSCURO : COLOR_INGRESO;
  const rojo = tema.dark ? COLOR_GASTO_OSCURO : COLOR_GASTO;
  const balance = ingresos - gastos;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.filaMes, { borderBottomColor: tema.colors.outlineVariant }]}>
      <Text variant="titleSmall" style={styles.nombreMes}>
        {nombre}
      </Text>
      <View style={styles.cifrasMes}>
        <Text variant="bodyMedium" style={[styles.cifra, { color: verde }]}>
          {`+${formatearMonto(ingresos, moneda)}`}
        </Text>
        <Text variant="bodyMedium" style={[styles.cifra, { color: rojo }]}>
          {`-${formatearMonto(gastos, moneda)}`}
        </Text>
        <Text variant="bodySmall" style={[styles.cifra, { color: tema.colors.onSurfaceVariant }]}>
          {`Balance ${balance > 0 ? '+' : ''}${formatearMonto(balance, moneda)}`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cabecera: { gap: 4, paddingTop: 8 },
  filaBuscar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 16, paddingRight: 8 },
  buscador: { flex: 1, borderRadius: 999 },
  textoBuscador: { minHeight: 0 },
  botonFiltro: { margin: 0 },
  badge: { position: 'absolute', top: -2, right: -2 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  vistas: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  seccion: { paddingHorizontal: 16, gap: 10, paddingTop: 4 },
  calendario: { marginTop: 12, gap: 6 },
  ayuda: { paddingHorizontal: 20 },
  contenidoAnio: { paddingBottom: 96, gap: 4 },
  selectorAnio: { flexDirection: 'row', alignItems: 'center', borderRadius: 999 },
  anio: { flex: 1, textAlign: 'center', fontWeight: '700' },
  tablaAnio: { borderRadius: 24, paddingHorizontal: 16, paddingVertical: 4 },
  filaMes: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  nombreMes: { flex: 1 },
  cifrasMes: { alignItems: 'flex-end', gap: 2 },
  cifra: { fontVariant: ['tabular-nums'] },
  fab: { position: 'absolute', right: 16, bottom: 16, borderRadius: 999 },
});
