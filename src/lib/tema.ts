import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

export const temaClaro: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1B6B4A',
    primaryContainer: '#A6F2C8',
    onPrimaryContainer: '#002112',
    secondaryContainer: '#CFE9DA',
    background: '#F6F8F6',
  },
};

export const temaOscuro: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#8BD6AD',
    primaryContainer: '#005234',
    onPrimaryContainer: '#A6F2C8',
    secondaryContainer: '#344B3F',
    background: '#111412',
  },
};

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
