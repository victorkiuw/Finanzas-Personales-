import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Switch, Text, TextInput, useTheme } from 'react-native-paper';

import { guardarPreferencia } from '../db/preferencias';
import { CLAVE_ALERTA_BRECHA, CLAVE_ALERTA_SUBIDA, leerConfigAlertas } from '../lib/avisos';
import { pedirPermiso } from '../lib/notificaciones';

function Fila({
  titulo,
  descripcion,
  activo,
  valor,
  onActivo,
  onValor,
}: {
  titulo: string;
  descripcion: string;
  activo: boolean;
  valor: string;
  onActivo: (v: boolean) => void;
  onValor: (v: string) => void;
}) {
  const tema = useTheme();
  return (
    <View style={styles.bloque}>
      <View style={styles.fila}>
        <View style={styles.flex}>
          <Text variant="titleSmall">{titulo}</Text>
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            {descripcion}
          </Text>
        </View>
        <Switch value={activo} onValueChange={onActivo} />
      </View>
      {activo && (
        <TextInput
          value={valor}
          onChangeText={onValor}
          keyboardType="decimal-pad"
          mode="outlined"
          dense
          right={<TextInput.Affix text="%" />}
        />
      )}
    </View>
  );
}

export default function PantallaAlertas() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [subidaActiva, setSubidaActiva] = useState(false);
  const [subida, setSubida] = useState('3');
  const [brechaActiva, setBrechaActiva] = useState(false);
  const [brecha, setBrecha] = useState('20');

  useEffect(() => {
    leerConfigAlertas(db).then((c) => {
      setSubidaActiva(c.subidaParalelo !== null);
      if (c.subidaParalelo !== null) setSubida(String(c.subidaParalelo).replace('.', ','));
      setBrechaActiva(c.brechaMaxima !== null);
      if (c.brechaMaxima !== null) setBrecha(String(c.brechaMaxima).replace('.', ','));
    });
  }, [db]);

  const numero = (t: string) => Number(t.replace(',', '.'));

  const guardar = async () => {
    const s = numero(subida);
    const b = numero(brecha);
    if ((subidaActiva && !(s > 0)) || (brechaActiva && !(b > 0))) {
      Alert.alert('Revisa los valores', 'Los porcentajes deben ser mayores que cero.');
      return;
    }
    if ((subidaActiva || brechaActiva) && !(await pedirPermiso())) {
      Alert.alert('Sin permiso', 'Activa las notificaciones de la app en los ajustes de Android para recibir alertas.');
      return;
    }
    const escribir = (clave: string, activo: boolean, v: number) =>
      activo ? guardarPreferencia(db, clave, String(v)) : db.runAsync(`DELETE FROM preferencias WHERE clave = ?`, [clave]);
    await escribir(CLAVE_ALERTA_SUBIDA, subidaActiva, s);
    await escribir(CLAVE_ALERTA_BRECHA, brechaActiva, b);
    Alert.alert('Guardado', 'Las alertas quedaron configuradas.');
  };

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: 'Alertas de tasa' }} />
      <Fila
        titulo="Subida del USDT"
        descripcion="Avisarme si el USDT sube este porcentaje o más respecto al día anterior."
        activo={subidaActiva}
        valor={subida}
        onActivo={setSubidaActiva}
        onValor={setSubida}
      />
      <Fila
        titulo="Brecha USDT / BCV"
        descripcion="Avisarme si la diferencia entre el USDT y el BCV llega a este porcentaje."
        activo={brechaActiva}
        valor={brecha}
        onActivo={setBrechaActiva}
        onValor={setBrecha}
      />
      <HelperText type="info" style={{ color: tema.colors.onSurfaceVariant }}>
        Las tasas se revisan al abrir la app o al volver a ella (cada 30 min como mucho). Si la app está cerrada todo
        el día, la alerta llegará la próxima vez que la abras. Máximo una alerta por día.
      </HelperText>
      <Button mode="contained" onPress={guardar}>
        Guardar
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: 16, gap: 20 },
  bloque: { gap: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
