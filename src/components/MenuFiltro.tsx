import { useState } from 'react';
import { Chip, Menu } from 'react-native-paper';

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

/** Chip que abre un menú de opciones; con un valor elegido muestra una × para quitarlo. */
export function MenuFiltro<T>({ etiqueta, icono, opciones, valor, etiquetaValor, onCambio }: Props<T>) {
  const [abierto, setAbierto] = useState(false);
  const elegida = opciones.find((o) => o.valor === valor);
  const activo = valor !== undefined;

  return (
    <Menu
      visible={abierto}
      onDismiss={() => setAbierto(false)}
      anchor={
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
      }
    >
      {opciones.map((o) => (
        <Menu.Item
          key={String(o.valor)}
          leadingIcon={o.icono}
          title={o.etiqueta}
          onPress={() => {
            setAbierto(false);
            onCambio(o.valor);
          }}
        />
      ))}
    </Menu>
  );
}
