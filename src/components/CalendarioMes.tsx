import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { montoCompacto } from '../lib/moneda';
import { COLOR_GASTO, COLOR_GASTO_OSCURO, COLOR_INGRESO, COLOR_INGRESO_OSCURO } from './ItemMovimiento';

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

const clave = (a: number, m: number, d: number) => `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Calendario del mes (lunes primero) con lo que entró y salió cada día, como
 * en Money Manager. Tocar un día lo elige (y otra vez lo suelta).
 */
export function CalendarioMes({
  mes,
  totales,
  elegido,
  onElegir,
}: {
  mes: Date;
  totales: Map<string, { ingresos: number; gastos: number }>;
  elegido: string | null;
  onElegir: (dia: string | null) => void;
}) {
  const tema = useTheme();
  const verde = tema.dark ? COLOR_INGRESO_OSCURO : COLOR_INGRESO;
  const rojo = tema.dark ? COLOR_GASTO_OSCURO : COLOR_GASTO;
  const a = mes.getFullYear();
  const m = mes.getMonth();
  const diasMes = new Date(a, m + 1, 0).getDate();
  const vacios = (new Date(a, m, 1).getDay() + 6) % 7;
  const hoy = new Date();
  const claveHoy = clave(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const celdas: (number | null)[] = [...Array(vacios).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)];
  while (celdas.length % 7) celdas.push(null);

  return (
    <View style={[styles.caja, { backgroundColor: tema.colors.surfaceVariant }]}>
      <View style={styles.fila}>
        {DIAS.map((d, i) => (
          <Text key={d} variant="labelSmall" style={[styles.cabecera, { color: i >= 5 ? tema.colors.primary : tema.colors.onSurfaceVariant }]}>
            {d}
          </Text>
        ))}
      </View>
      {Array.from({ length: celdas.length / 7 }, (_, semana) => (
        <View key={semana} style={styles.fila}>
          {celdas.slice(semana * 7, semana * 7 + 7).map((dia, i) => {
            if (dia === null) return <View key={i} style={styles.celda} />;
            const k = clave(a, m, dia);
            const t = totales.get(k);
            const activo = elegido === k;
            return (
              <Pressable
                key={i}
                onPress={() => onElegir(activo ? null : k)}
                accessibilityRole="button"
                accessibilityLabel={`Día ${dia}`}
                style={[
                  styles.celda,
                  activo && { backgroundColor: tema.colors.secondaryContainer },
                  k === claveHoy && !activo && { borderColor: tema.colors.primary, borderWidth: 1 },
                ]}
              >
                <Text variant="labelMedium" style={{ color: activo ? tema.colors.onSecondaryContainer : tema.colors.onSurface }}>
                  {dia}
                </Text>
                {t && t.ingresos > 0 && (
                  <Text style={[styles.monto, { color: verde }]} numberOfLines={1}>
                    {`+${montoCompacto(t.ingresos)}`}
                  </Text>
                )}
                {t && t.gastos > 0 && (
                  <Text style={[styles.monto, { color: rojo }]} numberOfLines={1}>
                    {`-${montoCompacto(t.gastos)}`}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { marginHorizontal: 16, borderRadius: 24, padding: 8 },
  fila: { flexDirection: 'row' },
  cabecera: { flex: 1, textAlign: 'center', paddingVertical: 6 },
  celda: { flex: 1, minHeight: 58, margin: 2, borderRadius: 12, alignItems: 'center', paddingTop: 4 },
  monto: { fontSize: 10, fontVariant: ['tabular-nums'] },
});
