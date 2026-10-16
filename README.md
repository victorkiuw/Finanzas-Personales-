# Finanzas Personales

App Android personal para controlar saldos en **USD efectivo, Bolívares y USDT**, con registro de
gastos/ingresos, transferencias entre billeteras, metas de ahorro y conversión con tasas BCV y
paralelo. Funciona sin internet (offline-first, datos en SQLite dentro del teléfono).

Especificación completa: ver el documento del proyecto (fases 1–5).

## Estado

| Fase | Alcance | Estado |
| --- | --- | --- |
| 1 | Expo + esquema SQLite + CRUD de billeteras | ✅ |
| 2 | Registro de gastos, ingresos y transferencias | ✅ |
| 3 | Tasas BCV / paralelo (ve.dolarapi.com) con caché y calculadora | ✅ |
| 4 | Dashboard con gráficas y metas de ahorro | ✅ |
| + | Deudas/préstamos indexados al dólar, presupuestos, recurrentes, recordatorios, buscador, alertas y gráfico de tasas, evolución del patrimonio, bloqueo con huella, copias automáticas, CSV y widget | ✅ |
| 5 | Pulido y APK final | ⏳ |

## Instalar en el teléfono (sin PC)

Cada push a `main` o a una rama `claude/**` ejecuta el workflow **APK Android**, que compila la app
y la publica en la release **`apk-latest`** del repositorio.

1. En el teléfono, abre el repo en GitHub → **Releases** → `apk-latest`.
2. Descarga `finanzas.apk` y ábrelo. Android pedirá permitir "instalar apps de origen desconocido"
   para tu navegador o gestor de archivos.
3. Las versiones nuevas se instalan encima de la anterior **sin perder datos** (todas se firman con
   la misma clave).

El APK es para procesadores ARM de 64 bits (prácticamente todos los Android actuales).

## Desarrollo

```bash
npm install
npm start            # servidor de desarrollo (Expo)
npm run typecheck    # TypeScript (app + pruebas)
npm test             # pruebas de la capa de datos con SQLite real (node:sqlite)
```

Las dependencias nativas deben ir en versiones compatibles con el SDK de Expo
(`npx expo install <paquete>`).

## Estructura

```
src/
  app/                  rutas (Expo Router): cada archivo es una pantalla
  components/           componentes de UI
  db/                   esquema, migraciones y consultas SQLite
  lib/                  utilidades (monedas, tema)
tests/                  pruebas con node:test
.github/workflows/      compilación del APK
```

## Decisiones de diseño

- **Montos en céntimos (enteros)** para que las sumas de saldos no acumulen errores de punto
  flotante. Las tasas de cambio sí son decimales.
- **El saldo de una billetera se calcula**: saldo inicial + movimientos. No se guarda un saldo
  aparte que pueda desincronizarse.
- **Transferencias** (ej. vender USDT por Bs.) restan de una billetera y suman a otra en su propia
  moneda, sin contar como ingreso ni gasto.
- **Metas de ahorro**: abonar descuenta el dinero de una billetera (queda apartado); retirar lo
  devuelve. El monto acumulado de la meta se calcula a partir de esos movimientos.
- **Billeteras con movimientos** no se borran ni cambian de moneda: se archivan, para no romper el
  historial.
- **Tasas**: BCV (oficial) y paralelo, de `ve.dolarapi.com/v1/dolares`. Se guardan en SQLite y se
  refrescan solas cada 30 min si hay internet; sin conexión se usa la última guardada y se muestra
  cuándo se consultó. Cualquier tasa se puede corregir a mano.
- **Conversión**: USD y USDT se consideran equivalentes (1:1); el bolívar se convierte con la tasa
  de referencia elegida (BCV o paralelo). El patrimonio total se muestra en USD o Bs.
- **Reportes sin distorsión cambiaria**: la app descarga una vez al día el histórico diario de tasas
  (`/v1/historicos/dolares`, desde 2023) y convierte cada ingreso/gasto con la tasa de **su** día.
  Transferencias y movimientos de metas no cuentan como ingreso ni gasto.
- **Gráficas** hechas con vistas (sin librerías nativas): gastos por categoría como barras
  horizontales ordenadas con monto y % (se leen mejor que una dona en el teléfono) e ingresos vs.
  gastos de los últimos 6 meses. Colores validados para daltonismo y contraste en claro/oscuro.
- **Comisión de Pago Móvil**: cada billetera guarda su comisión (por defecto las tarifas máximas del
  BCV desde agosto de 2026: 0,3 % a persona / 1,5 % a comercio, mínimo Bs. 14). Al registrar un gasto
  o transferencia se propone sola y se guarda como gasto aparte en "Comisiones", vinculado al
  movimiento (si se borra el movimiento, se borra su comisión).
- **Comprar/vender divisas** es una transferencia entre billeteras de distinta moneda con la tasa
  pactada. La app propone: la última tasa usada entre esas monedas, BCV, paralelo y la del banco
  (BCV + el margen configurado en la billetera en Bs.). Todas editables.
- **Categorías editables** desde Ajustes: las que tienen movimientos se archivan en vez de borrarse.
- **Copia de seguridad** (Ajustes): exporta un JSON con todos los datos para guardarlo en Drive,
  WhatsApp, etc., y lo restaura reemplazando los datos en una sola transacción.
- Formato de números venezolano: `Bs. 1.234,56`. Al escribir montos se acepta coma o punto decimal.
