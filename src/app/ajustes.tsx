import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { ActivityIndicator, Divider, List, Text, useTheme } from 'react-native-paper';

import { useTasas } from '../components/TasasProvider';
import { exportarDatos, importarDatos, resumenRespaldo, validarRespaldo, type Respaldo } from '../db/respaldo';
import { claveDia } from '../lib/fechas';

export default function PantallaAjustes() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { actualizar } = useTasas();
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const exportar = async () => {
    setTrabajando('Preparando la copia…');
    try {
      const respaldo = await exportarDatos(db);
      const archivo = new File(Paths.cache, `finanzas-respaldo-${claveDia(respaldo.exportado_en)}.json`);
      if (archivo.exists) archivo.delete();
      archivo.create();
      archivo.write(JSON.stringify(respaldo));
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('No disponible', 'Este teléfono no permite compartir archivos.');
        return;
      }
      await Sharing.shareAsync(archivo.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Guardar copia de seguridad',
      });
    } catch (e) {
      Alert.alert('No se pudo exportar', String(e));
    } finally {
      setTrabajando(null);
    }
  };

  const restaurar = async (respaldo: Respaldo) => {
    setTrabajando('Restaurando…');
    try {
      await importarDatos(db, respaldo);
      Alert.alert('Listo', 'Tus datos se restauraron desde la copia.');
      actualizar(true).catch(() => {});
      router.dismissTo('/');
    } catch (e) {
      Alert.alert('No se pudo restaurar', `No se cambió nada. Detalle: ${String(e)}`);
    } finally {
      setTrabajando(null);
    }
  };

  const importar = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
      if (r.canceled) return;
      setTrabajando('Leyendo la copia…');
      const texto = await new File(r.assets[0].uri).text();
      const respaldo = validarRespaldo(JSON.parse(texto));
      setTrabajando(null);
      Alert.alert(
        '¿Reemplazar todos tus datos?',
        `La copia del ${claveDia(respaldo.exportado_en)} tiene ${resumenRespaldo(respaldo)}. Todo lo que hay ahora en la app se borrará y se usará la copia.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Reemplazar', style: 'destructive', onPress: () => restaurar(respaldo) },
        ],
      );
    } catch (e) {
      setTrabajando(null);
      const mensaje = e instanceof SyntaxError ? 'El archivo no es un JSON válido.' : e instanceof Error ? e.message : String(e);
      Alert.alert('No se pudo leer la copia', mensaje);
    }
  };

  return (
    <ScrollView>
      <Stack.Screen options={{ title: 'Ajustes' }} />
      <List.Section>
        <List.Subheader>Personalizar</List.Subheader>
        <List.Item
          title="Categorías"
          description="Crear, renombrar, cambiar icono y color, o archivar"
          left={(p) => <List.Icon {...p} icon="tag-multiple" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/categorias')}
        />
        <List.Item
          title="Presupuestos mensuales"
          description="Límite de gasto por categoría"
          left={(p) => <List.Icon {...p} icon="chart-donut" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/presupuestos')}
        />
        <List.Item
          title="Comisión de Pago Móvil"
          description="Se configura en cada billetera: Billeteras → billetera → lápiz"
          left={(p) => <List.Icon {...p} icon="bank-transfer" />}
          onPress={() => router.navigate('/billeteras')}
        />
      </List.Section>
      <Divider />
      <List.Section>
        <List.Subheader>Copia de seguridad</List.Subheader>
        <List.Item
          title="Exportar copia"
          description="Guarda todos tus datos en un archivo (Drive, WhatsApp, Archivos…)"
          left={(p) => <List.Icon {...p} icon="cloud-upload" />}
          onPress={exportar}
          disabled={trabajando !== null}
        />
        <List.Item
          title="Restaurar desde una copia"
          description="Reemplaza los datos actuales por los del archivo"
          left={(p) => <List.Icon {...p} icon="cloud-download" />}
          onPress={importar}
          disabled={trabajando !== null}
        />
        {trabajando && (
          <List.Item title={trabajando} left={() => <ActivityIndicator style={styles.cargando} />} />
        )}
        <Text variant="bodySmall" style={[styles.nota, { color: tema.colors.onSurfaceVariant }]}>
          Tus datos viven solo en este teléfono. Exporta una copia de vez en cuando y guárdala fuera de él (por
          ejemplo en Google Drive) para no perderlos si cambias o pierdes el teléfono.
        </Text>
      </List.Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cargando: { marginLeft: 16 },
  nota: { paddingHorizontal: 16, paddingTop: 8 },
});
