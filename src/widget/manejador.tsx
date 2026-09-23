import * as SQLite from 'expo-sqlite';
import { requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';

import { NOMBRE_BD } from '../db/esquema';
import type { BaseDatos } from '../db/tipos';
import { datosWidget, type DatosWidget } from './datos';
import { NOMBRE_WIDGET, WidgetFinanzas } from './WidgetFinanzas';

/** Lee los datos con la app cerrada; si la base aún no existe (app nunca abierta) devuelve null. */
async function leerDatos(): Promise<DatosWidget | null> {
  let db: SQLite.SQLiteDatabase | null = null;
  try {
    db = await SQLite.openDatabaseAsync(NOMBRE_BD);
    return await datosWidget(db);
  } catch {
    return null;
  } finally {
    await db?.closeAsync().catch(() => {});
  }
}

/** Android llama a esto al agregar el widget, cada 30 min y al cambiarle el tamaño. */
export async function manejadorWidget(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetInfo.widgetName !== NOMBRE_WIDGET) return;
  if (!['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'].includes(props.widgetAction)) return;
  const datos = await leerDatos();
  props.renderWidget({
    light: <WidgetFinanzas datos={datos} oscuro={false} />,
    dark: <WidgetFinanzas datos={datos} oscuro />,
  });
}

/** Desde la app abierta: refresca el widget con los datos actuales (si está en la pantalla de inicio). */
export async function actualizarWidget(db: BaseDatos): Promise<void> {
  const datos = await datosWidget(db);
  await requestWidgetUpdate({
    widgetName: NOMBRE_WIDGET,
    renderWidget: () => ({
      light: <WidgetFinanzas datos={datos} oscuro={false} />,
      dark: <WidgetFinanzas datos={datos} oscuro />,
    }),
    widgetNotFound: () => {},
  });
}
