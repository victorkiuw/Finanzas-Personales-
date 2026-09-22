@AGENTS.md

## Proyecto

App personal de finanzas multimoneda (USD / BS / USDT) para Android. Ver README.md para fases y
decisiones de diseño. Idioma del código, UI y commits: español.

- Montos siempre en céntimos (INTEGER). Usa `parsearMonto` / `formatearMonto` de `src/lib/moneda.ts`.
- La capa de datos (`src/db/`) recibe un `BaseDatos` (subconjunto de expo-sqlite) para poder probarla
  con `node:sqlite` en `tests/`. No importes nada de React Native ahí.
- Cambios de esquema: agrega una migración nueva al final de `MIGRACIONES` en `src/db/esquema.ts`;
  nunca modifiques una ya publicada.
- Antes de terminar: `npm run typecheck` y `npm test`.
- En este entorno docs.expo.dev y api.expo.dev pueden estar bloqueados: para versiones compatibles
  consulta `node_modules/expo/bundledNativeModules.json` e instala con npm usando esa versión.
