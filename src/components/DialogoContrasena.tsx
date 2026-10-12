import { useEffect, useState } from 'react';
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';

/**
 * Pide una contraseña. Con `repetir` la pide dos veces (al crear la copia) y
 * permite seguir sin contraseña si `opcional`.
 */
export function DialogoContrasena({
  visible,
  titulo,
  mensaje,
  repetir = false,
  opcional = false,
  error,
  onListo,
  onCerrar,
}: {
  visible: boolean;
  titulo: string;
  mensaje: string;
  repetir?: boolean;
  opcional?: boolean;
  /** Error a mostrar (por ejemplo, contraseña incorrecta). */
  error?: string | null;
  /** Contraseña escrita, o null si eligió seguir sin contraseña. */
  onListo: (contrasena: string | null) => void;
  onCerrar: () => void;
}) {
  const [clave, setClave] = useState('');
  const [otra, setOtra] = useState('');
  const [ver, setVer] = useState(false);

  useEffect(() => {
    if (visible) {
      setClave('');
      setOtra('');
      setVer(false);
    }
  }, [visible]);

  const corta = clave.length > 0 && clave.length < 4;
  const distinta = repetir && otra.length > 0 && otra !== clave;
  const valida = clave.length >= 4 && (!repetir || otra === clave);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCerrar}>
        <Dialog.Title>{titulo}</Dialog.Title>
        <Dialog.Content style={{ gap: 8 }}>
          <Text variant="bodyMedium">{mensaje}</Text>
          <TextInput
            mode="outlined"
            label="Contraseña"
            value={clave}
            onChangeText={setClave}
            secureTextEntry={!ver}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            right={<TextInput.Icon icon={ver ? 'eye-off' : 'eye'} onPress={() => setVer((v) => !v)} />}
          />
          {repetir && (
            <TextInput
              mode="outlined"
              label="Repite la contraseña"
              value={otra}
              onChangeText={setOtra}
              secureTextEntry={!ver}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
          <HelperText type="error" visible={!!error || corta || distinta}>
            {error ?? (corta ? 'Usa al menos 4 caracteres.' : 'Las contraseñas no coinciden.')}
          </HelperText>
          {repetir && (
            <Text variant="bodySmall">
              Si olvidas la contraseña no hay forma de recuperar la copia. Anótala en un lugar seguro.
            </Text>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          {opcional ? (
            <Button onPress={() => onListo(null)}>Sin contraseña</Button>
          ) : (
            <Button onPress={onCerrar}>Cancelar</Button>
          )}
          <Button mode="contained" disabled={!valida} onPress={() => onListo(clave)}>
            {repetir ? 'Proteger' : 'Abrir'}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
