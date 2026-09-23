import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { DatosWidget } from './datos';

export const NOMBRE_WIDGET = 'Resumen';

/** Widget de la pantalla de inicio: patrimonio y tasas del día. Tocarlo abre la app. */
export function WidgetFinanzas({ datos, oscuro }: { datos: DatosWidget | null; oscuro: boolean }) {
  const fondo = oscuro ? '#1C1F1D' : '#F6F8F6';
  const texto = oscuro ? '#E6E9E6' : '#1A1C1A';
  const suave = oscuro ? '#A9B0AB' : '#5C635E';
  const acento = oscuro ? '#8BD6AD' : '#1B6B4A';
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
      <TextWidget text="Patrimonio" style={{ fontSize: 13, color: suave }} />
      <TextWidget
        text={datos ? datos.patrimonio : 'Abre la app para empezar'}
        style={{ fontSize: 24, fontWeight: 'bold', color: acento }}
        maxLines={1}
        truncate="END"
      />
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between' }}>
        <TextWidget text={datos ? `BCV ${datos.bcv}` : ''} style={{ fontSize: 14, color: texto }} />
        <TextWidget text={datos ? `Paralelo ${datos.paralelo}` : ''} style={{ fontSize: 14, color: texto }} />
      </FlexWidget>
      <TextWidget
        text={datos ? `Con tasa ${datos.referencia}${datos.actualizado ? ` · tasas de las ${datos.actualizado}` : ''}` : ''}
        style={{ fontSize: 11, color: suave }}
      />
    </FlexWidget>
  );
}
