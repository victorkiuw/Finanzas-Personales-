import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ActivityIndicator, Button, Dialog, Icon, Portal, Text, useTheme } from 'react-native-paper';

import { listarBilleteras } from '../db/billeteras';
import { listarCategorias } from '../db/categorias';
import { interpretarDictado } from '../lib/dictado';

/**
 * Dictar un movimiento: escucha, muestra lo que entiende y abre el formulario
 * ya lleno para revisarlo y guardarlo.
 */
export function DialogoDictado({ visible, onCerrar }: { visible: boolean; onCerrar: () => void }) {
  const db = useSQLiteContext();
  const tema = useTheme();
  const [escuchando, setEscuchando] = useState(false);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent('start', () => setEscuchando(true));
  useSpeechRecognitionEvent('end', () => setEscuchando(false));
  useSpeechRecognitionEvent('result', (e) => setTexto(e.results[0]?.transcript ?? ''));
  useSpeechRecognitionEvent('error', (e) => {
    setEscuchando(false);
    setError(e.error === 'no-speech' ? 'No te escuché. Toca "Hablar otra vez".' : `No se pudo escuchar (${e.message || e.error}).`);
  });

  const empezar = async () => {
    setTexto('');
    setError(null);
    const permiso = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permiso.granted) {
      setError('La app necesita permiso para usar el micrófono.');
      return;
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError('Este teléfono no tiene reconocimiento de voz (instala o actualiza la app de Google).');
      return;
    }
    ExpoSpeechRecognitionModule.start({ lang: 'es-VE', interimResults: true, addsPunctuation: false });
  };

  useEffect(() => {
    if (visible) empezar().catch((e) => setError(String(e)));
    else ExpoSpeechRecognitionModule.abort();
    // Solo al abrir o cerrar el diálogo.
  }, [visible]);

  const usar = async () => {
    const [billeteras, categorias] = await Promise.all([listarBilleteras(db), listarCategorias(db)]);
    const m = interpretarDictado(
      texto,
      billeteras,
      categorias.filter((c) => !c.archivada).map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo })),
    );
    onCerrar();
    const params: Record<string, string> = { tipo: m.tipo, nota: m.nota };
    if (m.monto) params.monto = String(m.monto);
    if (m.billeteraId) params.billetera = String(m.billeteraId);
    if (m.categoriaId) params.categoria = String(m.categoriaId);
    router.push({ pathname: '/movimiento/nuevo', params });
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCerrar}>
        <Dialog.Title>Dicta el movimiento</Dialog.Title>
        <Dialog.Content style={styles.contenido}>
          <Icon source={escuchando ? 'microphone' : 'microphone-off'} size={48} color={escuchando ? tema.colors.primary : tema.colors.onSurfaceVariant} />
          {escuchando && !texto && <ActivityIndicator />}
          <Text variant="titleMedium" style={styles.centrado}>
            {texto || (escuchando ? 'Te escucho…' : '')}
          </Text>
          {!texto && (
            <Text variant="bodySmall" style={[styles.centrado, { color: tema.colors.onSurfaceVariant }]}>
              Por ejemplo: "Gasté 500 bolívares en comida con Mercantil" o "Me pagaron 20 dólares en efectivo".
            </Text>
          )}
          {error && (
            <Text variant="bodyMedium" style={{ color: tema.colors.error }}>
              {error}
            </Text>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCerrar}>Cancelar</Button>
          {!escuchando && <Button onPress={() => empezar()}>Hablar otra vez</Button>}
          <Button mode="contained" disabled={!texto} onPress={usar}>
            Continuar
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  contenido: { alignItems: 'center', gap: 12 },
  centrado: { textAlign: 'center' },
});
