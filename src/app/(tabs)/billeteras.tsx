import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, FAB, List, Menu, Text, useTheme } from 'react-native-paper';

import { BotonFlotante } from '../../components/BotonFlotante';
import { DialogoDictado } from '../../components/DialogoDictado';
import { Dona } from '../../components/Dona';
import { Reordenable } from '../../components/Reordenable';
import { Pastilla, ResumenSaldo } from '../../components/ResumenSaldo';
import { TarjetaBilletera } from '../../components/TarjetaBilletera';
import { TarjetaDeuda } from '../../components/TarjetaDeuda';
import { useTasas } from '../../components/TasasProvider';
import {
  crearBilleterasSugeridas,
  establecerFavorita,
  guardarOrdenBilleteras,
  listarBilleteras,
  type Billetera,
} from '../../db/billeteras';
import { listarCompras, resumenCuotas, type CompraCuotas } from '../../db/cuotas';
import { ajenoPorBilletera, listarDeudas, resumenDeudas, type Deuda } from '../../db/deudas';
import { listarMetas, type Meta } from '../../db/metas';
import { convertir, totalConsolidado } from '../../lib/conversion';
import { formatearMonto } from '../../lib/moneda';

type Filtro = 'TODAS' | 'BS' | 'DIVISAS';
type Orden = 'PROPIO' | 'FAVORITAS' | 'SALDO' | 'NOMBRE';
const NOMBRE_ORDEN: Record<Orden, string> = {
  PROPIO: 'Mi orden (arrastrar)',
  FAVORITAS: 'Favoritas primero',
  SALDO: 'Mayor saldo',
  NOMBRE: 'Nombre',
};

export default function PantallaBilleteras() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [billeteras, setBilleteras] = useState<Billetera[] | null>(null);
  const [metas, setMetas] = useState<Meta[]>([]);
  // Deudas abiertas: de aquí sale el dinero de otras personas en mis cuentas.
  const [deudas, setDeudas] = useState<Deuda[]>([]);
  const [compras, setCompras] = useState<CompraCuotas[]>([]);
  const { tasas, referencia, cambio, monedaBase, actualizar } = useTasas();
  const [refrescando, setRefrescando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [orden, setOrden] = useState<Orden>('PROPIO');
  // Mientras se arrastra una billetera no se desplaza la pantalla.
  const [moviendo, setMoviendo] = useState(false);
  const [menuOrden, setMenuOrden] = useState(false);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [creando, setCreando] = useState(false);
  const [dictando, setDictando] = useState(false);

  const cargar = useCallback(async () => {
    const [b, m, d, c] = await Promise.all([
      listarBilleteras(db, { incluirArchivadas: true }),
      listarMetas(db),
      listarDeudas(db, { incluirCerradas: false }),
      listarCompras(db),
    ]);
    setBilleteras(b);
    setMetas(m);
    setDeudas(d);
    setCompras(c);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch((e) => Alert.alert('Error', String(e)));
    }, [cargar]),
  );

  const crearSugeridas = async () => {
    setCreando(true);
    try {
      await crearBilleterasSugeridas(db);
      await cargar();
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setCreando(false);
    }
  };

  if (!billeteras) {
    return <ActivityIndicator style={styles.cargando} />;
  }

  const activas = billeteras.filter((b) => !b.archivada);
  const archivadas = billeteras.filter((b) => b.archivada);
  const abrir = (b: Billetera) => router.push(`/billetera/${b.id}`);
  const ajenoPor = ajenoPorBilletera(deudas);
  // Dinero de otras personas, agrupado por billetera.
  const ajenas = deudas.filter((d) => d.ajeno && d.pendiente > 0);
  const grupos = activas
    .map((b) => ({ billetera: b, personas: ajenas.filter((d) => d.billetera_id === b.id) }))
    .filter((g) => g.personas.length > 0);

  // Lo mío de cada billetera, en la moneda elegida (para ordenar y para la dona).
  const enBase = (b: Billetera) => convertir(b.saldo - (ajenoPor.get(b.id) ?? 0), b.moneda, monedaBase, cambio);
  const filtradas = activas
    .filter((b) => filtro === 'TODAS' || (filtro === 'BS' ? b.moneda === 'BS' : b.moneda !== 'BS'))
    .sort((a, b) => {
      if (orden === 'NOMBRE') return a.nombre.localeCompare(b.nombre, 'es');
      if (orden === 'SALDO') return (enBase(b) ?? 0) - (enBase(a) ?? 0);
      if (orden === 'FAVORITAS') return Number(b.favorita) - Number(a.favorita);
      return 0; // el de la base: el orden propio
    });
  const segmentos = filtradas
    .map((b) => ({ id: b.id, nombre: b.nombre, color: b.color_hex, valor: Math.max(enBase(b) ?? 0, 0) }))
    .filter((x) => x.valor > 0);
  const totalFiltrado = segmentos.reduce((s, x) => s + x.valor, 0);

  // Lo que tengo (billeteras, aparte incluidas, y metas; sin lo de otros), lo que debo y el neto.
  const deMi = activas.map((b) => ({ moneda: b.moneda, saldo: b.saldo - (ajenoPor.get(b.id) ?? 0) }));
  const tengo = totalConsolidado([...deMi, ...metas.filter((m) => !m.archivada)], monedaBase, cambio);
  const rd = resumenDeudas(deudas, cambio);
  const cuotasUsd = resumenCuotas(compras, null).usado;
  const debo = convertir(rd.debo + cuotasUsd, 'USD', monedaBase, cambio);
  const meDeben = convertir(rd.meDeben, 'USD', monedaBase, cambio);
  const neto = tengo !== null && debo !== null && meDeben !== null ? tengo + meDeben - debo : null;

  const alternarFavorita = async (b: Billetera) => {
    await establecerFavorita(db, b.id, !b.favorita);
    await cargar();
  };

  return (
    <>
      <FlatList
        // Una sola fila con toda la lista, para poder reordenarla arrastrando.
        data={activas.length > 0 ? ['lista'] : []}
        keyExtractor={(k) => k}
        scrollEnabled={!moviendo}
        renderItem={() => {
          const tarjeta = (b: Billetera) => (
            <TarjetaBilletera
              billetera={b}
              deOtros={ajenoPor.get(b.id)}
              onPress={() => abrir(b)}
              onFavorita={() => alternarFavorita(b).catch((e) => Alert.alert('Error', String(e)))}
            />
          );
          if (orden !== 'PROPIO') return <View>{filtradas.map((b) => <View key={b.id}>{tarjeta(b)}</View>)}</View>;
          return (
            <Reordenable
              items={filtradas}
              clave={(b) => b.id}
              onArrastre={setMoviendo}
              onReordenar={(nuevas) => {
                // Las que no se ven por el filtro conservan su lugar relativo al final.
                const ids = [...nuevas.map((b) => b.id), ...activas.filter((b) => !nuevas.includes(b)).map((b) => b.id)];
                guardarOrdenBilleteras(db, ids)
                  .then(cargar)
                  .catch((e) => Alert.alert('Error', String(e)));
              }}
              render={(b) => tarjeta(b)}
            />
          );
        }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={async () => {
              setRefrescando(true);
              await actualizar(true).catch(() => {});
              await cargar().catch(() => {});
              setRefrescando(false);
            }}
            colors={[tema.colors.onPrimaryContainer]}
            progressBackgroundColor={tema.colors.primaryContainer}
          />
        }
        ListHeaderComponent={
          activas.length > 0 ? (
            <View style={styles.cabecera}>
              <ResumenSaldo billeteras={activas} metas={metas} deudas={deudas} />

              <View style={[styles.patrimonio, { backgroundColor: tema.colors.surfaceVariant }]}>
                <Cifra titulo="Tengo" valor={tengo} moneda={monedaBase} />
                <Cifra titulo="Debo" valor={debo} moneda={monedaBase} rojo />
                <Cifra titulo="Neto" valor={neto} moneda={monedaBase} fuerte />
              </View>
              <Text variant="bodySmall" style={[styles.nota, { color: tema.colors.onSurfaceVariant }]}>
                {`Tengo: billeteras y metas, sin lo de otros. Debo: deudas y cuotas de Cashea. El neto suma lo que te deben${
                  meDeben ? ` (${formatearMonto(meDeben, monedaBase)})` : ''
                }.`}
              </Text>

              <View style={styles.filtros}>
                <Pastilla texto="Todas" elegida={filtro === 'TODAS'} onPress={() => setFiltro('TODAS')} />
                <Pastilla texto="Bolívares" elegida={filtro === 'BS'} onPress={() => setFiltro('BS')} />
                <Pastilla texto="Divisas" elegida={filtro === 'DIVISAS'} onPress={() => setFiltro('DIVISAS')} />
              </View>

              {segmentos.length > 0 && (
                <View style={[styles.caja, { backgroundColor: tema.colors.surfaceVariant }]}>
                  <Dona
                    segmentos={segmentos}
                    titulo={filtro === 'TODAS' ? 'Total' : filtro === 'BS' ? 'En bolívares' : 'En divisas'}
                    valorCentro={formatearMonto(totalFiltrado, monedaBase)}
                    formatear={(v) => formatearMonto(v, monedaBase)}
                    tamano={180}
                    leyenda={false}
                  />
                </View>
              )}

              <View style={styles.filaOrden}>
                <Text variant="bodyMedium" style={[styles.flex, { color: tema.colors.onSurfaceVariant }]}>
                  {`${filtradas.length} ${filtradas.length === 1 ? 'billetera' : 'billeteras'}${orden === 'PROPIO' ? ' · mantén presionada para moverla' : ''}`}
                </Text>
                <Menu
                  visible={menuOrden}
                  onDismiss={() => setMenuOrden(false)}
                  anchor={
                    <Button mode="outlined" compact icon="sort" onPress={() => setMenuOrden(true)}>
                      Ordenar
                    </Button>
                  }
                >
                  {(Object.keys(NOMBRE_ORDEN) as Orden[]).map((o) => (
                    <Menu.Item
                      key={o}
                      title={NOMBRE_ORDEN[o]}
                      leadingIcon={orden === o ? 'check' : undefined}
                      onPress={() => {
                        setOrden(o);
                        setMenuOrden(false);
                      }}
                    />
                  ))}
                </Menu>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Text variant="titleMedium" style={styles.centrado}>
              Aún no tienes billeteras
            </Text>
            <Text variant="bodyMedium" style={[styles.centrado, { color: tema.colors.onSurfaceVariant }]}>
              Crea una por cada lugar donde tienes dinero: efectivo en dólares, cuenta en bolívares,
              Binance…
            </Text>
            <Button mode="contained" icon="auto-fix" onPress={crearSugeridas} loading={creando} disabled={creando}>
              Crear Efectivo USD, Banco Bs. y Binance USDT
            </Button>
            <Button mode="text" onPress={() => router.push('/billetera/nueva')}>
              Crear una a mi medida
            </Button>
          </View>
        }
        ListFooterComponent={
          <>
            {activas.length > 0 && (
              <Button mode="outlined" icon="wallet-plus" style={styles.nueva} onPress={() => router.push('/billetera/nueva')}>
                Agregar billetera
              </Button>
            )}
            {activas.length > 0 && (
              <View>
                <Text variant="titleMedium" style={styles.subtitulo}>
                  Dinero de otros
                </Text>
                <Text variant="bodySmall" style={[styles.explicacion, { color: tema.colors.onSurfaceVariant }]}>
                  {grupos.length > 0
                    ? 'Lo que es de otras personas en tus cuentas. No cuenta en tu disponible.'
                    : '¿Le prestaste tu cuenta a alguien o te dieron dinero a guardar? Regístralo para que no cuente como tuyo.'}
                </Text>
                {grupos.map((g) => (
                  <View key={g.billetera.id}>
                    <Text variant="labelLarge" style={styles.explicacion}>
                      {`${g.billetera.nombre} · tuyo: ${formatearMonto(g.billetera.saldo - (ajenoPor.get(g.billetera.id) ?? 0), g.billetera.moneda)}`}
                    </Text>
                    {g.personas.map((d) => (
                      <TarjetaDeuda key={d.id} deuda={d} tasas={tasas} referencia={referencia} onPress={() => router.push(`/deuda/${d.id}`)} />
                    ))}
                  </View>
                ))}
                <Button mode="outlined" icon="account-cash" style={styles.nueva} onPress={() => router.push('/ajeno/nuevo')}>
                  Le presté mi cuenta a alguien
                </Button>
              </View>
            )}
            {archivadas.length > 0 && (
              <List.Accordion
                title={`Archivadas (${archivadas.length})`}
                expanded={verArchivadas}
                onPress={() => setVerArchivadas((v) => !v)}
                style={{ backgroundColor: tema.colors.background }}
              >
                {archivadas.map((b) => (
                  <TarjetaBilletera key={b.id} billetera={b} onPress={() => abrir(b)} />
                ))}
              </List.Accordion>
            )}
          </>
        }
      />
      {activas.length > 0 && (
        <>
          <BotonFlotante onDictar={() => setDictando(true)} />
          <DialogoDictado visible={dictando} onCerrar={() => setDictando(false)} />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  cargando: { marginTop: 48 },
  flex: { flex: 1 },
  cabecera: { gap: 12, paddingBottom: 4 },
  patrimonio: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 22, paddingVertical: 14 },
  nota: { marginHorizontal: 20, marginTop: -6 },
  filtros: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  caja: { marginHorizontal: 16, borderRadius: 24, padding: 16 },
  filaOrden: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  cifra: { flex: 1, alignItems: 'center', gap: 2 },
  subtitulo: { marginHorizontal: 16, marginTop: 8 },
  explicacion: { marginHorizontal: 16, marginBottom: 8 },
  vacio: { padding: 24, gap: 12, marginTop: 32 },
  centrado: { textAlign: 'center' },
  fab: { position: 'absolute', right: 16 },
  nueva: { marginHorizontal: 16, marginBottom: 12 },
});

function Cifra({
  titulo,
  valor,
  moneda,
  rojo = false,
  fuerte = false,
}: {
  titulo: string;
  valor: number | null;
  moneda: Parameters<typeof formatearMonto>[1];
  rojo?: boolean;
  fuerte?: boolean;
}) {
  const tema = useTheme();
  return (
    <View style={styles.cifra}>
      <Text variant="labelMedium" style={{ color: tema.colors.onSurfaceVariant }}>
        {titulo}
      </Text>
      <Text
        variant="titleSmall"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          fontWeight: fuerte ? '800' : '600',
          fontVariant: ['tabular-nums'],
          color: rojo && valor ? tema.colors.error : fuerte ? tema.colors.primary : tema.colors.onSurface,
        }}
      >
        {valor !== null ? formatearMonto(valor, moneda) : '—'}
      </Text>
    </View>
  );
}
