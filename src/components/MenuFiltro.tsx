import { useState } from 'react';
import { Chip, List } from 'react-native-paper';

import { HojaInferior } from './HojaInferior';

export interface OpcionFiltro<T> {
  valor: T;
  etiqueta: string;
  icono?: string;
}

interface Props<T> {
  /** Texto del chip cuando no hay nada elegido. */
  etiqueta: string;
  icono: string;
  opciones: OpcionFiltro<T>[];
  valor: T | undefined;
  /** Etiqueta a mostrar para el valor actual cuando no está entre las opciones (p. ej. un rango personalizado). */
  etiquetaValor?: string;
  onCambio: (valor: T | undefined) => void;
}

/** Chip que abre una ventana desde abajo con las opciones; con un valor elegido muestra una × para quitarlo. */
export function MenuFiltro<T>({ etiqueta, icono, opciones, valor, etiquetaValor, onCambio }: Props<T>) {
  const [abierto, setAbierto] = useState(false);
  const elegida = opciones.find((o) => o.valor === valor);
  const activo = valor !== undefined;

  return (
    <>
      <Chip
        icon={icono}
        mode={activo ? 'flat' : 'outlined'}
        selected={activo}
        showSelectedCheck={false}
        onPress={() => setAbierto(true)}
        onClose={activo ? () => onCambio(undefined) : undefined}
      >
        {etiquetaValor ?? elegida?.etiqueta ?? etiqueta}
      </Chip>
      <HojaInferior visible={abierto} titulo={etiqueta} onCerrar={() => setAbierto(false)}>
        {activo && (
          <List.Item
            title="Todas"
            left={(p) => <List.Icon {...p} icon="close-circle-outline" />}
            onPress={() => {
              setAbierto(false);
              onCambio(undefined);
            }}
          />
        )}
        {opciones.map((o) => (
          <List.Item
            key={String(o.valor)}
            title={o.etiqueta}
            left={(p) => <List.Icon {...p} icon={o.icono ?? 'circle-small'} />}
            right={(p) => (o.valor === valor ? <List.Icon {...p} icon="check" /> : null)}
            onPress={() => {
              setAbierto(false);
              onCambio(o.valor);
            }}
          />
        ))}
      </HojaInferior>
    </>
  );
}
