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
