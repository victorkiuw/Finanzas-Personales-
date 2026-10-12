import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Icon, Modal, Portal, Text, useTheme } from 'react-native-paper';

/** Preferencia que marca que ya se vio la guía. */
export const CLAVE_GUIA = 'guia_vista';

const PASOS: { icono: string; titulo: string; texto: string }[] = [
  {
    icono: 'hand-wave',
    titulo: '¡Bienvenido!',
    texto: 'Lleva tu dinero en bolívares, dólares, USDT y euros en un solo lugar. Todo se guarda solo en tu teléfono, sin cuentas ni registros.',
  },
  {
    icono: 'wallet',
    titulo: 'Tus billeteras',
    texto: 'Crea una por cada lugar donde tienes dinero: banco, efectivo, Binance… En Billeteras ves cuánto hay en cada una, cuánto tienes, cuánto debes y tu neto.',
  },
  {
    icono: 'eye-outline',
    titulo: 'Tu balance',
    texto: 'Arriba en Inicio está lo disponible. Cámbialo entre Bs., USD (tasa BCV), USDT y EUR con las pastillas, y ocúltalo con el ojo.',
  },
  {
    icono: 'plus-circle',
    titulo: 'Registra en segundos',
    texto: 'Usa los botones Gasto, Ingreso, Transferir o Dictar (por voz), o el botón + verde. La comisión de Pago Móvil se calcula sola.',
  },
  {
    icono: 'calendar-month',
    titulo: 'Tus movimientos',
    texto: 'En Movimientos los ves por mes con el total de cada día, en un calendario o el año completo. Busca o filtra por billetera y categoría.',
  },
  {
    icono: 'piggy-bank',
    titulo: 'Ahorros, deudas y Cashea',
    texto: 'En Ahorros tienes metas de ahorro, lo que prestas y te prestan (a la tasa del día) y tus compras a cuotas.',
  },
  {
    icono: 'calculator-variant',
    titulo: 'Tasas del día',
    texto: 'En Tasas ves la BCV, la USDT y el euro, y una calculadora que convierte cada moneda con su tasa.',
  },
];

/** Guía corta para quien abre la app por primera vez (se puede volver a ver desde Ajustes). */
export function GuiaBienvenida({ visible, onTerminar }: { visible: boolean; onTerminar: () => void }) {
  const tema = useTheme();
  const [paso, setPaso] = useState(0);
  const p = PASOS[paso];
  const ultimo = paso === PASOS.length - 1;
  const terminar = () => {
    setPaso(0);
    onTerminar();
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={terminar} contentContainerStyle={[styles.caja, { backgroundColor: tema.colors.elevation.level3 }]}>
        <View style={[styles.icono, { backgroundColor: tema.colors.primaryContainer }]}>
          <Icon source={p.icono} size={34} color={tema.colors.onPrimaryContainer} />
        </View>
        <Text variant="headlineSmall" style={styles.titulo}>
          {p.titulo}
        </Text>
        <Text variant="bodyLarge" style={[styles.texto, { color: tema.colors.onSurfaceVariant }]}>
          {p.texto}
        </Text>
        <View style={styles.puntos}>
          {PASOS.map((_, i) => (
            <View
              key={i}
              style={[styles.punto, { backgroundColor: i === paso ? tema.colors.primary : tema.colors.outline }, i === paso && styles.puntoActivo]}
            />
          ))}
        </View>
        <View style={styles.botones}>
          {!ultimo ? (
            <Button onPress={terminar}>Saltar</Button>
          ) : (
            <View />
          )}
          <Button mode="contained" onPress={() => (ultimo ? terminar() : setPaso(paso + 1))}>
            {ultimo ? 'Empezar' : 'Siguiente'}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  caja: { margin: 24, borderRadius: 28, padding: 24, alignItems: 'center', gap: 12 },
  icono: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontWeight: '800', textAlign: 'center' },
  texto: { textAlign: 'center' },
  puntos: { flexDirection: 'row', gap: 6, marginTop: 4 },
  punto: { width: 7, height: 7, borderRadius: 4 },
  puntoActivo: { width: 20 },
  botones: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 4 },
});
