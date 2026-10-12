import * as Haptics from 'expo-haptics';

/**
 * Vibración corta para dar respuesta al tocar: suave (cambiar de pestaña,
 * soltar algo), media (abrir un menú, empezar a arrastrar) o éxito (guardar).
 * Si el teléfono no la soporta, no pasa nada.
 */
export function vibrar(tipo: 'suave' | 'media' | 'exito' | 'aviso' = 'suave'): void {
  const p =
    tipo === 'exito'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : tipo === 'aviso'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        : Haptics.impactAsync(tipo === 'media' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  p.catch(() => {});
}
