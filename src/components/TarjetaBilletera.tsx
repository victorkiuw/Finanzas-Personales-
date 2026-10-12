import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';

import type { Billetera } from '../db/billeteras';
import { convertir } from '../lib/conversion';
import { formatearMonto, INFO_MONEDA } from '../lib/moneda';
import { IconoCuadro } from './IconoCuadro';
import { useTasas } from './TasasProvider';

interface Props {
  billetera: Billetera;
  /** Parte del saldo que es de otras personas. */
  deOtros?: number;
  onPress: () => void;
  /** Si se indica, muestra la estrella para marcarla como favorita. */
  onFavorita?: () => void;
}

/**
 * Billetera en la lista: ícono, nombre, saldo y estrella de favorita. Las de
 * bolívares tienen un botón Bs. / $ para ver su equivalente en dólares (como en Rial).
 */
export function TarjetaBilletera({ billetera, deOtros, onPress, onFavorita }: Props) {
  const tema = useTheme();
  const { cambio } = useTasas();
  const negativo = billetera.saldo < 0;
  // Las billeteras guardadas aparte muestran el saldo oculto hasta tocar el ojo.
  const [ver, setVer] = useState(false);
  const [enDolares, setEnDolares] = useState(false);
  const oculta = !billetera.en_total && !ver;
  const esBs = billetera.moneda === 'BS';
  const dolares = esBs ? convertir(billetera.saldo, 'BS', 'USD', cambio) : null;
  const saldoTexto =
    enDolares && dolares !== null ? formatearMonto(dolares, 'USD') : formatearMonto(billetera.saldo, billetera.moneda);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.tarjeta, { backgroundColor: tema.colors.surfaceVariant }, billetera.archivada && styles.archivada]}
      accessibilityLabel={`${billetera.nombre}, ${oculta ? 'saldo oculto' : saldoTexto}`}
    >
      <IconoCuadro icono={billetera.icono} color={billetera.color_hex} tamano={46} />
      <View style={styles.textos}>
        <Text variant="titleMedium" numberOfLines={1}>
          {billetera.nombre}
        </Text>
        <Text variant="bodyMedium" numberOfLines={1} style={[styles.saldo, negativo && { color: tema.colors.error }]}>
          {oculta ? '••••••' : saldoTexto}
          {!oculta && esBs && !enDolares && dolares !== null && (
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              {`  ≈ ${formatearMonto(dolares, 'USD')}`}
            </Text>
          )}
        </Text>
        <Text variant="bodySmall" numberOfLines={1} style={{ color: tema.colors.onSurfaceVariant }}>
          {INFO_MONEDA[billetera.moneda].nombre}
          {billetera.archivada ? ' · Archivada' : ''}
          {!billetera.en_total ? ' · Aparte, no suma al total' : ''}
        </Text>
        {deOtros && !oculta ? (
          <Text variant="bodySmall" numberOfLines={1} style={{ color: tema.colors.onSurfaceVariant }}>
            {`De otros: ${formatearMonto(deOtros, billetera.moneda)} · tuyo: ${formatearMonto(billetera.saldo - deOtros, billetera.moneda)}`}
          </Text>
        ) : null}
      </View>
      {esBs && dolares !== null && !oculta && (
        <View style={[styles.alternar, { backgroundColor: tema.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
          {(['Bs', '$'] as const).map((op) => {
            const activa = (op === '$') === enDolares;
            return (
              <Pressable
                key={op}
                onPress={() => setEnDolares(op === '$')}
                accessibilityRole="button"
                accessibilityState={{ selected: activa }}
                accessibilityLabel={op === '$' ? 'Ver en dólares' : 'Ver en bolívares'}
                style={[styles.opcion, activa && { backgroundColor: tema.colors.surface }]}
              >
                <Text variant="labelMedium" style={{ color: activa ? tema.colors.onSurface : tema.colors.onSurfaceVariant }}>
                  {op}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!billetera.en_total && (
        <IconButton
          icon={ver ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          onPress={() => setVer((v) => !v)}
          accessibilityLabel={ver ? 'Ocultar saldo' : 'Ver saldo'}
          style={styles.boton}
        />
      )}
      {onFavorita && (
        <IconButton
          icon={billetera.favorita ? 'star' : 'star-outline'}
          iconColor={billetera.favorita ? '#FACC15' : tema.colors.onSurfaceVariant}
          size={22}
          onPress={onFavorita}
          accessibilityLabel={billetera.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
          style={styles.boton}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: { marginHorizontal: 16, marginBottom: 10, borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  archivada: { opacity: 0.6 },
  textos: { flex: 1, gap: 1 },
  saldo: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  boton: { margin: 0 },
  alternar: { flexDirection: 'row', borderRadius: 999, padding: 3 },
  opcion: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
