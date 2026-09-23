import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, AppState, ScrollView, StyleSheet } from 'react-native';
import { ActivityIndicator, Divider, List, Switch, Text, useTheme } from 'react-native-paper';

import { abrirAjustesNotificaciones, lectorDisponible, tienePermiso } from '../../modules/lector-notificaciones';
import { autenticar, CLAVE_BLOQUEO, puedeBloquear } from '../components/Candado';
import { useTasas } from '../components/TasasProvider';
import { exportarMovimientosCsv } from '../db/exportar';
import { exportarDatos, importarDatos, resumenRespaldo, validarRespaldo, type Respaldo } from '../db/respaldo';
import { guardarPreferencia, leerPreferencia } from '../db/preferencias';
import { claveDia } from '../lib/fechas';
import { cancelarRecordatorioDiario, pedirPermiso, programarRecordatorioDiario } from '../lib/notificaciones';
import { CLAVE_ULTIMA_EXPORTACION, compartirArchivo } from '../lib/respaldoAuto';

const CLAVE_RECORDATORIO = 'recordatorio_hora';

export default function PantallaAjustes() {
  const db = useSQLiteContext();
  const tema = useTheme();
  const { actualizar } = useTasas();
  const [trabajando, setTrabajando] = useState<string | null>(null);
  // "HH:MM" si el recordatorio diario está activo.
  const [recordatorio, setRecordatorio] = useState<string | null>(null);
  const [bloqueo, setBloqueo] = useState(false);
  const [leeAvisos, setLeeAvisos] = useState(() => tienePermiso());

  // Al volver de los ajustes de Android se revisa si dio el permiso.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active') setLeeAvisos(tienePermiso());
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    leerPreferencia(db, CLAVE_RECORDATORIO).then(setRecordatorio).catch(() => {});
    leerPreferencia(db, CLAVE_BLOQUEO).then((v) => setBloqueo(v === '1')).catch(() => {});
  }, [db]);

  const elegirHoraRecordatorio = async () => {
    if (!(await pedirPermiso())) {
      Alert.alert('Sin permiso', 'Activa las notificaciones de la app en los ajustes de Android para recibir el recordatorio.');
      return;
    }
    const [h, m] = (recordatorio ?? '21:00').split(':').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(2000, 0, 1, h, m),
      mode: 'time',
      is24Hour: true,
      onChange: async (e, f) => {
        if (e.type !== 'set' || !f) return;
        const hora = `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;
        await programarRecordatorioDiario(f.getHours(), f.getMinutes());
        await guardarPreferencia(db, CLAVE_RECORDATORIO, hora);
        setRecordatorio(hora);
      },
    });
  };

  const alternarRecordatorio = async (activar: boolean) => {
    if (activar) {
      await elegirHoraRecordatorio();
      return;
    }
    await cancelarRecordatorioDiario();
    await db.runAsync(`DELETE FROM preferencias WHERE clave = ?`, [CLAVE_RECORDATORIO]);
    setRecordatorio(null);
  };

  const exportar = async () => {
    setTrabajando('Preparando la copia…');
    try {
      const respaldo = await exportarDatos(db);
      await compartirArchivo(
        `finanzas-respaldo-${claveDia(respaldo.exportado_en)}.json`,
        JSON.stringify(respaldo),
        'application/json',
        'Guardar copia de seguridad',
      );
      await guardarPreferencia(db, CLAVE_ULTIMA_EXPORTACION, new Date().toISOString());
    } catch (e) {
      Alert.alert('No se pudo exportar', String(e));
    } finally {
      setTrabajando(null);
    }
  };

  const exportarCsv = async () => {
    setTrabajando('Preparando el archivo…');
    try {
      const { csv, cantidad } = await exportarMovimientosCsv(db);
      if (cantidad === 0) {
        Alert.alert('Sin movimientos', 'Todavía no hay movimientos para exportar.');
        return;
      }
      await compartirArchivo(`finanzas-movimientos-${claveDia(new Date().toISOString())}.csv`, csv, 'text/csv', 'Exportar movimientos');
    } catch (e) {
      Alert.alert('No se pudo exportar', String(e));
    } finally {
      setTrabajando(null);
    }
  };

  const alternarBloqueo = async (activar: boolean) => {
    if (activar && !(await puedeBloquear())) {
      Alert.alert('Sin bloqueo en el teléfono', 'Configura primero una huella, PIN o patrón en los ajustes de Android.');
      return;
    }
    // Se pide la huella también para desactivarlo, para que otro no pueda quitarlo.
    if (!(await autenticar(activar ? 'Confirma para activar el bloqueo' : 'Confirma para quitar el bloqueo'))) return;
    await guardarPreferencia(db, CLAVE_BLOQUEO, activar ? '1' : '0');
    setBloqueo(activar);
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
          title="Gastos e ingresos recurrentes"
          description="Alquiler, internet, sueldo… se anotan solos o te aviso"
          left={(p) => <List.Icon {...p} icon="calendar-refresh" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/recurrentes')}
        />
        <List.Item
          title="Recordatorio diario"
          description={recordatorio ? `Todos los días a las ${recordatorio} · toca para cambiar la hora` : 'Te aviso para que anotes tus gastos'}
          left={(p) => <List.Icon {...p} icon="bell-ring" />}
          right={() => <Switch value={recordatorio !== null} onValueChange={alternarRecordatorio} />}
          onPress={recordatorio ? elegirHoraRecordatorio : () => alternarRecordatorio(true)}
        />
        <List.Item
          title="Alertas de tasa"
          description="Si el USDT sube mucho o la brecha con el BCV se dispara"
          left={(p) => <List.Icon {...p} icon="bell-alert" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/alertas')}
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
      {lectorDisponible && (
        <>
          <Divider />
          <List.Section>
            <List.Subheader>Avisos del banco</List.Subheader>
            <List.Item
              title="Leer las notificaciones del banco"
              description={
                leeAvisos
                  ? 'Activado: los pagos y cobros que te avise tu banco aparecerán en Inicio para registrarlos.'
                  : 'Cuando te llegue un aviso de Pago Móvil o compra, la app te propone el movimiento ya lleno. Toca para darle acceso en Android.'
              }
              descriptionNumberOfLines={4}
              left={(p) => <List.Icon {...p} icon="bell-ring-outline" />}
              right={() => <Switch value={leeAvisos} onValueChange={() => abrirAjustesNotificaciones()} />}
              onPress={() => abrirAjustesNotificaciones()}
            />
          </List.Section>
        </>
      )}
      <Divider />
      <List.Section>
        <List.Subheader>Seguridad</List.Subheader>
        <List.Item
          title="Bloquear con huella o PIN"
          description="Pide desbloquear al abrir la app o al volver a ella tras 1 minuto"
          left={(p) => <List.Icon {...p} icon="fingerprint" />}
          right={() => <Switch value={bloqueo} onValueChange={alternarBloqueo} />}
          onPress={() => alternarBloqueo(!bloqueo)}
        />
      </List.Section>
      <Divider />
      <List.Section>
        <List.Subheader>Copia de seguridad y exportar</List.Subheader>
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
        <List.Item
          title="Copias automáticas en el teléfono"
          description="Una por día, se guardan las últimas 7"
          left={(p) => <List.Icon {...p} icon="history" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/copias')}
        />
        <List.Item
          title="Exportar movimientos a Excel (CSV)"
          description="Para abrir en Excel o Google Sheets"
          left={(p) => <List.Icon {...p} icon="microsoft-excel" />}
          onPress={exportarCsv}
          disabled={trabajando !== null}
        />
        {trabajando && (
          <List.Item title={trabajando} left={() => <ActivityIndicator style={styles.cargando} />} />
        )}
        <Text variant="bodySmall" style={[styles.nota, { color: tema.colors.onSurfaceVariant }]}>
          Copia en Google Drive: si en tu teléfono está activada la copia de seguridad de Google (Ajustes de Android →
          Google → Copia de seguridad), Android guarda los datos de esta app en tu cuenta una vez al día y los
          restaura al instalarla de nuevo con la misma cuenta. Aun así, exporta una copia de vez en cuando y guárdala
          fuera del teléfono.
        </Text>
      </List.Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cargando: { marginLeft: 16 },
  nota: { paddingHorizontal: 16, paddingTop: 8 },
});
