// Atajos de Android: al dejar presionado el ícono de la app salen "Nuevo gasto",
// "Nuevo ingreso", "Transferir" y "Dictar", que abren la app directo ahí
// (con enlaces finanzas://… que entiende expo-router).
const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ATAJOS = [
  { id: 'gasto', corto: 'Gasto', largo: 'Nuevo gasto', ruta: 'movimiento/nuevo?tipo=GASTO' },
  { id: 'ingreso', corto: 'Ingreso', largo: 'Nuevo ingreso', ruta: 'movimiento/nuevo?tipo=INGRESO' },
  { id: 'transferir', corto: 'Transferir', largo: 'Transferir entre billeteras', ruta: 'movimiento/nuevo?tipo=TRANSFERENCIA' },
  { id: 'alcanza', corto: '¿Me alcanza?', largo: '¿Me alcanza?', ruta: 'me-alcanza' },
];

const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, "\\'");

function xmlAtajos(paquete, esquema) {
  const items = ATAJOS.map(
    (a) => `  <shortcut
    android:shortcutId="${a.id}"
    android:enabled="true"
    android:icon="@mipmap/ic_launcher"
    android:shortcutShortLabel="@string/atajo_${a.id}_corto"
    android:shortcutLongLabel="@string/atajo_${a.id}_largo">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="${esquema}://${a.ruta.replace(/&/g, '&amp;')}"
      android:targetPackage="${paquete}"
      android:targetClass="${paquete}.MainActivity" />
  </shortcut>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">\n${items}\n</shortcuts>\n`;
}

module.exports = function conAtajos(config) {
  const paquete = config.android?.package;
  const esquema = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  if (!paquete || !esquema) throw new Error('atajos-android: faltan android.package o scheme en app.json');

  config = withStringsXml(config, (c) => {
    for (const a of ATAJOS) {
      c.modResults = AndroidConfig.Strings.setStringItem(
        [
          { $: { name: `atajo_${a.id}_corto` }, _: escapar(a.corto) },
          { $: { name: `atajo_${a.id}_largo` }, _: escapar(a.largo) },
        ],
        c.modResults,
      );
    }
    return c;
  });

  config = withAndroidManifest(config, (c) => {
    const actividad = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    actividad['meta-data'] = (actividad['meta-data'] ?? []).filter((m) => m.$['android:name'] !== 'android.app.shortcuts');
    actividad['meta-data'].push({ $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/atajos' } });
    return c;
  });

  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const carpeta = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(carpeta, { recursive: true });
      fs.writeFileSync(path.join(carpeta, 'atajos.xml'), xmlAtajos(paquete, esquema));
      return c;
    },
  ]);

  return config;
};
