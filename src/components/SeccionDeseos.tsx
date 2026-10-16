import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Button, HelperText, IconButton, Text, TextInput, useTheme } from 'react-native-paper';

import { ErrorValidacion, listarBilleteras } from '../db/billeteras';
import { crearDeseo, deseoAMeta, eliminarDeseo, listarDeseos, marcarComprado, semanasParaLlegar, type Deseo } from '../db/deseos';
import { ajenoPorBilletera, listarDeudas } from '../db/deudas';
import { filasDeReporte } from '../db/reportes';
import { convertir, totalConsolidado } from '../lib/conversion';
import { formatearMonto, INFO_MONEDA, MONEDAS, parsearMonto, type Moneda } from '../lib/moneda';
import { BarraAnimada } from './BarraAnimada';
import { useListo } from './ConfirmacionListo';
import { Pastilla } from './ResumenSaldo';
import { useTasas } from './TasasProvider';
import { useConversor } from './useConversor';

/**
 * Lista de deseos: cosas que quieres comprar con su precio. Muestra cuánto te
 * falta con lo disponible, en cuántas semanas llegas a tu ritmo de ahorro y
 * avisa cuando ya te alcanza. Se puede convertir en una meta de ahorro.
 */
export function SeccionDeseos({ encabezado }: { encabezado: ReactNode }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const mostrarListo = useListo();
  const { cambio, monedaBase } = useTasas();
  const conversor = useConversor();
  const [deseos, setDeseos] = useState<Deseo[]>([]);
  const [disponibleUsd, setDisponibleUsd] = useState<number | null>(null);
  /** Ahorro promedio por semana (ingresos − gastos de los últimos 90 días), en USD. */
  const [semanalUsd, setSemanalUsd] = useState(0);
  const [nombre, setNombre] = useState('');
  const [precioTexto, setPrecioTexto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>(monedaBase === 'BS' ? 'BS' : 'USD');
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - 90);
    const [d, b, deudas, filas] = await Promise.all([
      listarDeseos(db),
      listarBilleteras(db),
      listarDeudas(db, { incluirCerradas: false }),
      filasDeReporte(db, desde.toISOString(), new Date(Date.now() + 86400000).toISOString()),
    ]);
    setDeseos(d);
    const ajeno = ajenoPorBilletera(deudas);
    setDisponibleUsd(
      totalConsolidado(
        b.filter((x) => x.en_total).map((x) => ({ moneda: x.moneda, saldo: x.saldo - (ajeno.get(x.id) ?? 0) })),
        'USD',
        cambio,
      ),
    );
    if (conversor) {
      let neto = 0;
      for (const f of filas) {
        const v = conversor.aBase(f.monto, f.moneda, 'USD', f.fecha) ?? 0;
        neto += f.tipo === 'INGRESO' ? v : -v;
      }
      setSemanalUsd(Math.round(neto / (90 / 7)));
    }
  }, [db, cambio, conversor]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(() => {});
    }, [cargar]),
  );

  const agregar = async () => {
    setError(null);
    try {
      await crearDeseo(db, { nombre, precio: parsearMonto(precioTexto) ?? 0, moneda });
      setNombre('');
      setPrecioTexto('');
      mostrarListo('Agregado a tu lista');
      await cargar();
    } catch (e) {
      setError(e instanceof ErrorValidacion ? e.message : String(e));
    }
  };

  const verde = tema.dark ? '#4ADE80' : '#2E7D32';

  return (
    <FlatList
      data={deseos}
      keyExtractor={(d) => String(d.id)}
      contentContainerStyle={styles.lista}
      ListHeaderComponent={
        <View style={styles.cabecera}>
          {encabezado}
          <View style={[styles.caja, { backgroundColor: tema.colors.surfaceVariant }]}>
            <Text variant="titleMedium">¿Qué quieres comprar?</Text>
            <TextInput label="Por ejemplo: audífonos" value={nombre} onChangeText={setNombre} mode="outlined" dense />
            <View style={styles.fila}>
              <TextInput
                label="Precio"
                value={precioTexto}
                onChangeText={setPrecioTexto}
                keyboardType="decimal-pad"
                mode="outlined"
                dense
                style={styles.flex}
                right={<TextInput.Affix text={INFO_MONEDA[moneda].corto} />}
              />
              <Button mode="contained" icon="plus" onPress={agregar}>
                Agregar
              </Button>
            </View>
            <View style={styles.pastillas}>
              {MONEDAS.map((m) => (
                <Pastilla key={m} texto={INFO_MONEDA[m].corto} elegida={moneda === m} onPress={() => setMoneda(m)} />
              ))}
            </View>
            {error && <HelperText type="error">{error}</HelperText>}
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text variant="bodyMedium" style={[styles.vacio, { color: tema.colors.onSurfaceVariant }]}>
          Anota lo que quieres comprar y te digo cuándo te alcanza.
        </Text>
      }
      renderItem={({ item }) => {
        const disponible = disponibleUsd !== null ? convertir(disponibleUsd, 'USD', item.moneda, cambio) : null;
        const fraccion = disponible !== null ? Math.min(Math.max(disponible / item.precio, 0), 1) : 0;
        const alcanza = disponible !== null && disponible >= item.precio;
        const falta = disponible !== null ? item.precio - disponible : null;
        const semanal = convertir(semanalUsd, 'USD', item.moneda, cambio) ?? 0;
        const semanas = falta !== null ? semanasParaLlegar(falta, semanal) : null;
        return (
          <View style={[styles.caja, { backgroundColor: tema.colors.surfaceVariant, opacity: item.comprado ? 0.55 : 1 }]}>
            <View style={styles.fila}>
              <View style={styles.flex}>
                <Text variant="titleMedium" style={item.comprado && styles.tachado}>
                  {item.nombre}
                </Text>
                <Text variant="bodyLarge" style={styles.cifra}>
                  {formatearMonto(item.precio, item.moneda)}
                </Text>
              </View>
              <IconButton
                icon={item.comprado ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                accessibilityLabel={item.comprado ? 'Marcar como no comprado' : 'Ya lo compré'}
                onPress={() => {
                  marcarComprado(db, item.id, !item.comprado)
                    .then(() => {
                      if (!item.comprado) mostrarListo('¡A disfrutarlo!');
                      return cargar();
                    })
                    .catch(() => {});
                }}
              />
            </View>
            {!item.comprado && (
              <>
                <View style={[styles.pista, { backgroundColor: tema.colors.outlineVariant }]}>
                  <BarraAnimada porcentaje={fraccion * 100} style={[styles.relleno, { backgroundColor: alcanza ? verde : tema.colors.primary }]} />
                </View>
                <Text variant="bodySmall" style={{ color: alcanza ? verde : tema.colors.onSurfaceVariant }}>
                  {alcanza
                    ? `🎉 ¡Ya te alcanza! Te quedarían ${formatearMonto(-(falta ?? 0), item.moneda)} disponibles.`
                    : falta !== null
                      ? `Te faltan ${formatearMonto(falta, item.moneda)}. ${
                          semanas !== null
                            ? `A tu ritmo de ahorro (≈ ${formatearMonto(semanal, item.moneda)} por semana) llegas en ${semanas} semana${semanas === 1 ? '' : 's'}.`
                            : 'En los últimos 3 meses gastaste más de lo que entró: así no se llega.'
                        }`
                      : 'Falta la tasa para calcularlo.'}
                </Text>
                <View style={styles.acciones}>
                  <Button
                    compact
                    mode="contained-tonal"
                    icon="flag-plus"
                    onPress={() =>
                      deseoAMeta(db, item)
                        .then((id) => router.push(`/meta/${id}`))
                        .catch((e) => Alert.alert('Error', String(e)))
                    }
                  >
                    Hacerlo meta
                  </Button>
                  <Button compact icon="delete" textColor={tema.colors.error} onPress={() => eliminarDeseo(db, item.id).then(cargar).catch(() => {})}>
                    Quitar
                  </Button>
                </View>
              </>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lista: { paddingBottom: 96, gap: 10 },
  cabecera: { gap: 10 },
  caja: { marginHorizontal: 16, borderRadius: 22, padding: 16, gap: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pastillas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vacio: { textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },
  cifra: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  tachado: { textDecorationLine: 'line-through' },
  pista: { height: 8, borderRadius: 4, overflow: 'hidden' },
  relleno: { height: 8, borderRadius: 4 },
  acciones: { flexDirection: 'row', gap: 8 },
});
