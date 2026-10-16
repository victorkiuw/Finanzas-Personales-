import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { DatosWidget } from './datos';

export const NOMBRE_WIDGET = 'Resumen';

/** Botones del widget: abren la app directo en el formulario (enlaces finanzas://). */
const BOTONES = [
  { texto: '− Gasto', uri: 'finanzas://movimiento/nuevo?tipo=GASTO', fondo: '#EF4444', color: '#FFFFFF' },
  { texto: '+ Ingreso', uri: 'finanzas://movimiento/nuevo?tipo=INGRESO', fondo: '#22C55E', color: '#FFFFFF' },
  { texto: '⇄ Mover', uri: 'finanzas://movimiento/nuevo?tipo=TRANSFERENCIA', fondo: '#3B82F6', color: '#FFFFFF' },
] as const;

/** Widget de la pantalla de inicio: disponible, tasas del día y botones de gasto, ingreso y transferencia. */
export function WidgetFinanzas({ datos, oscuro }: { datos: DatosWidget | null; oscuro: boolean }) {
  const fondo = oscuro ? '#111214' : '#FFFFFF';
  const texto = oscuro ? '#E6E9E6' : '#1A1C1A';
  const suave = oscuro ? '#A9B0AB' : '#5C635E';
  const acento = oscuro ? '#B5E61D' : '#4D7C0F';
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: fondo,
        borderRadius: 20,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <TextWidget text="Disponible" style={{ fontSize: 13, color: suave }} />
      <TextWidget
        text={datos ? datos.patrimonio : 'Abre la app para empezar'}
        style={{ fontSize: 24, fontWeight: 'bold', color: acento }}
        maxLines={1}
        truncate="END"
      />
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between' }}>
        <TextWidget text={datos ? `BCV ${datos.bcv}` : ''} style={{ fontSize: 13, color: texto }} />
        <TextWidget text={datos ? `USDT ${datos.paralelo}` : ''} style={{ fontSize: 13, color: texto }} />
        <TextWidget text={datos ? `€ ${datos.euro}` : ''} style={{ fontSize: 13, color: texto }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between' }}>
        {BOTONES.map((b) => (
          <FlexWidget
            key={b.texto}
            clickAction="OPEN_URI"
            clickActionData={{ uri: b.uri }}
            style={{ backgroundColor: b.fondo, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
          >
            <TextWidget text={b.texto} style={{ fontSize: 13, fontWeight: 'bold', color: b.color }} />
          </FlexWidget>
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}
