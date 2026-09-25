import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Card, IconButton, Text, useTheme } from 'react-native-paper';

import type { Billetera } from '../db/billeteras';
import { formatearMonto, INFO_MONEDA } from '../lib/moneda';

interface Props {
  billetera: Billetera;
  /** Parte del saldo que es de otras personas. */
  deOtros?: number;
  onPress: () => void;
}

export function TarjetaBilletera({ billetera, deOtros, onPress }: Props) {
  const tema = useTheme();
  const negativo = billetera.saldo < 0;
  // Las billeteras guardadas aparte muestran el saldo oculto hasta tocar el ojo.
  const [ver, setVer] = useState(false);
  const oculta = !billetera.en_total && !ver;

  return (
    <Card
      mode="contained"
      onPress={onPress}
      style={[styles.tarjeta, billetera.archivada && styles.archivada]}
      accessibilityLabel={`${billetera.nombre}, ${oculta ? 'saldo oculto' : formatearMonto(billetera.saldo, billetera.moneda)}`}
    >
      <Card.Content style={styles.contenido}>
        <Avatar.Icon
          size={44}
          icon={billetera.icono}
          color="#FFFFFF"
          style={{ backgroundColor: billetera.color_hex }}
        />
        <View style={styles.textos}>
          <Text variant="titleMedium" numberOfLines={1}>
            {billetera.nombre}
          </Text>
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            {INFO_MONEDA[billetera.moneda].nombre}
            {billetera.archivada ? ' · Archivada' : ''}
            {!billetera.en_total ? ' · Aparte, no suma al total' : ''}
          </Text>
          {deOtros && !oculta ? (
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              {`De otros: ${formatearMonto(deOtros, billetera.moneda)} · tuyo: ${formatearMonto(billetera.saldo - deOtros, billetera.moneda)}`}
            </Text>
          ) : null}
        </View>
        <Text
          variant="titleMedium"
          style={[styles.saldo, negativo && { color: tema.colors.error }]}
          numberOfLines={1}
        >
          {oculta ? '••••••' : formatearMonto(billetera.saldo, billetera.moneda)}
        </Text>
        {!billetera.en_total && (
          <IconButton
            icon={ver ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            onPress={() => setVer((v) => !v)}
            accessibilityLabel={ver ? 'Ocultar saldo' : 'Ver saldo'}
            style={styles.ojo}
          />
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  tarjeta: { marginHorizontal: 16, marginBottom: 12 },
  archivada: { opacity: 0.6 },
  contenido: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1 },
  saldo: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  ojo: { margin: 0 },
});
