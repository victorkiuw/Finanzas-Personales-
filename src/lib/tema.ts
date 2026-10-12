import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/*
 * Diseño inspirado en Rial: fondo negro, tarjetas grises muy redondeadas sin
 * bordes y un solo acento verde lima para lo importante (botones, lo elegido).
 */
export const LIMA = '#B5E61D';

export const temaClaro: MD3Theme = {
  ...MD3LightTheme,
  roundness: 6,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#4D7C0F',
    onPrimary: '#FFFFFF',
    primaryContainer: LIMA,
    onPrimaryContainer: '#142200',
    secondary: '#56642F',
    secondaryContainer: '#E3F5B8',
    onSecondaryContainer: '#1A2600',
    tertiaryContainer: '#FFE7B8',
    background: '#F4F5F1',
    surface: '#F4F5F1',
    surfaceVariant: '#FFFFFF',
    onSurfaceVariant: '#5B5F57',
    outline: '#C5C8BF',
    outlineVariant: '#E2E4DD',
    elevation: {
      level0: 'transparent',
      level1: '#FFFFFF',
      level2: '#FBFCF8',
      level3: '#F6F8F1',
      level4: '#F3F5EE',
      level5: '#EFF2E9',
    },
  },
};

export const temaOscuro: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 6,
  colors: {
    ...MD3DarkTheme.colors,
    primary: LIMA,
    onPrimary: '#0E1700',
    primaryContainer: LIMA,
    onPrimaryContainer: '#0E1700',
    secondary: '#C9E879',
    secondaryContainer: '#2C3A0E',
    onSecondaryContainer: '#DDF59A',
    tertiaryContainer: '#3D2E0B',
    onTertiaryContainer: '#FFDFA0',
    background: '#000000',
    surface: '#000000',
    onSurface: '#F2F3EE',
    surfaceVariant: '#1D1E21',
    onSurfaceVariant: '#A3A6AD',
    surfaceDisabled: 'rgba(242, 243, 238, 0.12)',
    outline: '#3B3D42',
    outlineVariant: '#2A2C30',
    inverseSurface: '#E9EAE4',
    elevation: {
      level0: 'transparent',
      level1: '#16171A',
      level2: '#1D1E21',
      level3: '#232428',
      level4: '#26272B',
      level5: '#2A2B30',
    },
  },
};

/** Fondo de la tarjeta principal (el balance) y de los botones redondos. */
export function coloresExtra(oscuro: boolean) {
  return oscuro
    ? { heroe: '#1A2405', heroeTexto: '#F2F3EE', redondo: '#1D1E21', barra: '#111214' }
    : { heroe: '#E8F6C4', heroeTexto: '#142200', redondo: '#FFFFFF', barra: '#FFFFFF' };
}

/** Color con transparencia (para fondos suaves de íconos): `#RRGGBB` + alfa 0–1. */
export function conAlfa(hex: string, alfa: number): string {
  const a = Math.round(Math.min(Math.max(alfa, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${a}` : hex;
}

export const ICONOS_BILLETERA = [
  'wallet',
  'cash',
  'bank',
  'credit-card',
  'cellphone',
  'bitcoin',
  'piggy-bank',
  'safe',
] as const;

export const COLORES_BILLETERA = [
  '#2E7D32',
  '#1565C0',
  '#F9A825',
  '#6A1B9A',
  '#C62828',
  '#00838F',
  '#EF6C00',
  '#455A64',
] as const;

/** Iconos para categorías (Material Community Icons). */
export const ICONOS_CATEGORIA = [
  'food', 'food-fork-drink', 'cart', 'car', 'bus', 'gas-station', 'motorbike', 'lightning-bolt',
  'water', 'wifi', 'cellphone', 'home', 'sofa', 'medical-bag', 'pill', 'dumbbell', 'party-popper',
  'movie', 'gamepad-variant', 'school', 'book-open-variant', 'tshirt-crew', 'shoe-sneaker', 'gift',
  'paw', 'baby-carriage', 'airplane', 'beach', 'bank-transfer', 'credit-card', 'briefcase', 'laptop',
  'storefront', 'cash-plus', 'hand-coin', 'chart-line', 'tools', 'hair-dryer', 'church', 'dots-horizontal',
] as const;

/** Colores para categorías: la paleta de billeteras más algunos tonos extra. */
export const COLORES_CATEGORIA = [
  ...COLORES_BILLETERA,
  '#E53935', '#D81B60', '#8E24AA', '#3949AB', '#00897B', '#7CB342', '#FDD835', '#6D4C41',
] as const;
