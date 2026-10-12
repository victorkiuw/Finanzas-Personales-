import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/*
 * Diseño inspirado en Rial: fondo negro, tarjetas grises muy redondeadas sin
 * bordes y un solo acento verde lima para lo importante (botones, lo elegido).
 */
export const LIMA = '#B5E61D';

export type Acento = 'lima' | 'verde' | 'azul' | 'morado' | 'rosa' | 'naranja';

/** Colores de acento a elegir en Apariencia: el vivo (botones, lo elegido) y uno más oscuro para el modo claro. */
export const ACENTOS: Record<Acento, { nombre: string; vivo: string; claro: string }> = {
  lima: { nombre: 'Lima', vivo: LIMA, claro: '#4D7C0F' },
  verde: { nombre: 'Verde', vivo: '#34D399', claro: '#047857' },
  azul: { nombre: 'Azul', vivo: '#60A5FA', claro: '#1D4ED8' },
  morado: { nombre: 'Morado', vivo: '#A78BFA', claro: '#6D28D9' },
  rosa: { nombre: 'Rosa', vivo: '#F472B6', claro: '#BE185D' },
  naranja: { nombre: 'Naranja', vivo: '#FB923C', claro: '#C2410C' },
};

export function esAcento(v: unknown): v is Acento {
  return typeof v === 'string' && v in ACENTOS;
}

/** Mezcla dos colores `#RRGGBB`: `t` = 0 da `a`, 1 da `b`. */
export function mezclar(a: string, b: string, t: number): string {
  const ca = parseInt(a.slice(1), 16);
  const cb = parseInt(b.slice(1), 16);
  const canal = (d: number) => {
    const x = (ca >> d) & 255;
    const y = (cb >> d) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `#${((canal(16) << 16) | (canal(8) << 8) | canal(0)).toString(16).padStart(6, '0').toUpperCase()}`;
}

/** Tema claro u oscuro con el acento elegido. */
export function crearTema(oscuro: boolean, acento: Acento = 'lima'): MD3Theme {
  const { vivo, claro } = ACENTOS[acento];
  const sobreVivo = mezclar(vivo, '#000000', 0.88);
  if (!oscuro) {
    return {
      ...MD3LightTheme,
      roundness: 6,
      colors: {
        ...MD3LightTheme.colors,
        primary: claro,
        onPrimary: '#FFFFFF',
        primaryContainer: vivo,
        onPrimaryContainer: sobreVivo,
        secondary: mezclar(claro, '#5B5F57', 0.45),
        secondaryContainer: mezclar('#FFFFFF', vivo, 0.3),
        onSecondaryContainer: mezclar(claro, '#000000', 0.6),
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
  }
  return {
    ...MD3DarkTheme,
    roundness: 6,
    colors: {
      ...MD3DarkTheme.colors,
      primary: vivo,
      onPrimary: sobreVivo,
      primaryContainer: vivo,
      onPrimaryContainer: sobreVivo,
      secondary: mezclar(vivo, '#FFFFFF', 0.3),
      secondaryContainer: mezclar('#000000', vivo, 0.24),
      onSecondaryContainer: mezclar(vivo, '#FFFFFF', 0.45),
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
}

export const temaClaro = crearTema(false);
export const temaOscuro = crearTema(true);

/** Fondo de la tarjeta principal (el balance, teñido con el acento) y de los botones redondos. */
export function coloresExtra(tema: MD3Theme) {
  const acento = tema.colors.primaryContainer;
  return tema.dark
    ? { heroe: mezclar('#000000', acento, 0.14), heroeTexto: '#F2F3EE', redondo: '#1D1E21', barra: '#111214' }
    : { heroe: mezclar('#FFFFFF', acento, 0.28), heroeTexto: tema.colors.onPrimaryContainer, redondo: '#FFFFFF', barra: '#FFFFFF' };
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
