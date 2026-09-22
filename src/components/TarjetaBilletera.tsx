import { StyleSheet, View } from 'react-native';
import { Avatar, Card, Text, useTheme } from 'react-native-paper';

import type { Billetera } from '../db/billeteras';
import { formatearMonto, INFO_MONEDA } from '../lib/moneda';

interface Props {
  billetera: Billetera;
  onPress: () => void;
}

export function TarjetaBilletera({ billetera, onPress }: Props) {
  const tema = useTheme();
  const negativo = billetera.saldo < 0;

  return (
    <Card
      mode="contained"
      onPress={onPress}
      style={[styles.tarjeta, billetera.archivada && styles.archivada]}
      accessibilityLabel={`${billetera.nombre}, ${formatearMonto(billetera.saldo, billetera.moneda)}`}
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
          </Text>
        </View>
        <Text
          variant="titleMedium"
          style={[styles.saldo, negativo && { color: tema.colors.error }]}
          numberOfLines={1}
        >
          {formatearMonto(billetera.saldo, billetera.moneda)}
        </Text>
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
});
