// Punto de entrada: la app (Expo Router) y el widget de la pantalla de inicio de Android.
import 'expo-router/entry';

import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { manejadorWidget } from './src/widget/manejador';

registerWidgetTaskHandler(manejadorWidget);
