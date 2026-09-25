import type { BaseDatos } from './tipos';

export const NOMBRE_BD = 'finanzas.db';

/*
 * Convenciones del modelo:
 * - Montos en céntimos (INTEGER). Las tasas de cambio son REAL.
 * - transacciones.monto está en la moneda de billetera_origen_id.
 * - GASTO resta y INGRESO suma en billetera_origen_id.
 * - TRANSFERENCIA resta `monto` de la billetera origen y suma `monto_destino`
 *   (en la moneda de la billetera destino) a billetera_destino_id; no cuenta
 *   como ingreso ni gasto en los reportes.
 * - APORTE_META resta `monto` de billetera_origen_id y suma `monto_destino`
 *   (en la moneda de la meta) a la meta. RETIRO_META hace lo inverso: suma
 *   `monto` a billetera_origen_id y resta `monto_destino` de la meta. El saldo
 *   de una meta se calcula a partir de estos movimientos.
 */
interface Migracion {
  sql: string;
  /**
   * Reconstruye tablas referenciadas por otras: se ejecuta con las claves
   * foráneas desactivadas (el procedimiento que recomienda SQLite) y se
   * comprueba que sigan consistentes antes de confirmar.
   */
  sinClavesForaneas?: boolean;
}

const MIGRACIONES: (string | Migracion)[] = [
  `
  CREATE TABLE billeteras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS', 'USDT')),
    balance_inicial INTEGER NOT NULL DEFAULT 0,
    icono TEXT NOT NULL DEFAULT 'wallet',
    color_hex TEXT NOT NULL DEFAULT '#2E7D32',
    archivada INTEGER NOT NULL DEFAULT 0 CHECK (archivada IN (0, 1)),
    creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('GASTO', 'INGRESO')),
    color_hex TEXT NOT NULL,
    icono TEXT NOT NULL DEFAULT 'tag',
    UNIQUE (nombre, tipo)
  );

  CREATE TABLE metas_ahorro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    monto_objetivo INTEGER NOT NULL CHECK (monto_objetivo > 0),
    moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS', 'USDT')),
    fecha_objetivo TEXT,
    color_hex TEXT NOT NULL DEFAULT '#1565C0',
    archivada INTEGER NOT NULL DEFAULT 0 CHECK (archivada IN (0, 1)),
    creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE transacciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('GASTO', 'INGRESO', 'TRANSFERENCIA', 'APORTE_META', 'RETIRO_META')),
    monto INTEGER NOT NULL CHECK (monto > 0),
    fecha TEXT NOT NULL,
    categoria_id INTEGER REFERENCES categorias (id) ON DELETE RESTRICT,
    billetera_origen_id INTEGER NOT NULL REFERENCES billeteras (id) ON DELETE RESTRICT,
    billetera_destino_id INTEGER REFERENCES billeteras (id) ON DELETE RESTRICT,
    meta_id INTEGER REFERENCES metas_ahorro (id) ON DELETE RESTRICT,
    monto_destino INTEGER CHECK (monto_destino IS NULL OR monto_destino > 0),
    tasa_cambio REAL,
    nota TEXT,
    creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (tipo <> 'TRANSFERENCIA' OR (
      billetera_destino_id IS NOT NULL
      AND billetera_destino_id <> billetera_origen_id
      AND monto_destino IS NOT NULL)),
    CHECK (tipo NOT IN ('APORTE_META', 'RETIRO_META') OR (meta_id IS NOT NULL AND monto_destino IS NOT NULL))
  );

  CREATE INDEX idx_transacciones_fecha ON transacciones (fecha);
  CREATE INDEX idx_transacciones_origen ON transacciones (billetera_origen_id);
  CREATE INDEX idx_transacciones_destino ON transacciones (billetera_destino_id);
  CREATE INDEX idx_transacciones_categoria ON transacciones (categoria_id);
  CREATE INDEX idx_transacciones_meta ON transacciones (meta_id);

  CREATE TABLE tasas_cache (
    par TEXT PRIMARY KEY CHECK (par IN ('BCV', 'PARALELO')),
    tasa REAL NOT NULL CHECK (tasa > 0),
    ultima_actualizacion TEXT NOT NULL
  );

  INSERT INTO categorias (nombre, tipo, color_hex, icono) VALUES
    ('Comida', 'GASTO', '#E53935', 'food'),
    ('Transporte', 'GASTO', '#FB8C00', 'car'),
    ('Servicios', 'GASTO', '#FDD835', 'lightning-bolt'),
    ('Hogar', 'GASTO', '#6D4C41', 'home'),
    ('Salud', 'GASTO', '#D81B60', 'medical-bag'),
    ('Ocio', 'GASTO', '#8E24AA', 'party-popper'),
    ('Educación', 'GASTO', '#3949AB', 'school'),
    ('Ropa', 'GASTO', '#00897B', 'tshirt-crew'),
    ('Comisiones', 'GASTO', '#546E7A', 'bank-transfer'),
    ('Otros gastos', 'GASTO', '#757575', 'dots-horizontal'),
    ('Salario', 'INGRESO', '#2E7D32', 'briefcase'),
    ('Freelance', 'INGRESO', '#43A047', 'laptop'),
    ('Ventas', 'INGRESO', '#7CB342', 'storefront'),
    ('Regalos', 'INGRESO', '#C0CA33', 'gift'),
    ('Otros ingresos', 'INGRESO', '#9E9D24', 'dots-horizontal');
  `,
  // v2: origen de cada tasa (API o escrita a mano), cuándo se consultó, y preferencias de la app.
  `
  ALTER TABLE tasas_cache ADD COLUMN consultada_en TEXT;
  ALTER TABLE tasas_cache ADD COLUMN origen TEXT NOT NULL DEFAULT 'API' CHECK (origen IN ('API', 'MANUAL'));

  CREATE TABLE preferencias (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  `,
  // v3: tasa de cada día, para convertir los movimientos pasados con la tasa de su fecha.
  `
  CREATE TABLE historial_tasas (
    par TEXT NOT NULL CHECK (par IN ('BCV', 'PARALELO')),
    dia TEXT NOT NULL,
    tasa REAL NOT NULL CHECK (tasa > 0),
    PRIMARY KEY (par, dia)
  );

  INSERT INTO historial_tasas (par, dia, tasa)
    SELECT par, date(COALESCE(consultada_en, ultima_actualizacion), 'localtime'), tasa FROM tasas_cache;
  `,
  // v4: comisión configurable por billetera (Pago Móvil), categorías editables/archivables y
  // enlace de cada comisión con el movimiento que la originó (se borra junto con él).
  `
  ALTER TABLE billeteras ADD COLUMN comision_porcentaje REAL NOT NULL DEFAULT 0 CHECK (comision_porcentaje >= 0);
  ALTER TABLE billeteras ADD COLUMN comision_minima INTEGER NOT NULL DEFAULT 0 CHECK (comision_minima >= 0);
  ALTER TABLE categorias ADD COLUMN archivada INTEGER NOT NULL DEFAULT 0 CHECK (archivada IN (0, 1));
  ALTER TABLE transacciones ADD COLUMN comision_de INTEGER REFERENCES transacciones (id) ON DELETE CASCADE;
  CREATE INDEX idx_transacciones_comision ON transacciones (comision_de);
  `,
  // v5: margen del banco sobre la tasa BCV al comprar/vender divisas (p. ej. 2 = BCV + 2 %).
  `
  ALTER TABLE billeteras ADD COLUMN margen_cambio REAL;
  `,
  // v6: deudas y préstamos. SQLite no permite cambiar un CHECK, así que la tabla de
  // transacciones se reconstruye con los tipos nuevos y la columna deuda_id.
  // La tabla nueva se referencia a sí misma por su nombre temporal: al renombrarla,
  // SQLite actualiza esa referencia (y el DROP de la vieja no la toca).
  `
  CREATE TABLE deudas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('ME_DEBEN', 'DEBO')),
    persona TEXT NOT NULL,
    moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS', 'USDT')),
    monto INTEGER NOT NULL CHECK (monto > 0),
    tasa_referencia REAL CHECK (tasa_referencia IS NULL OR tasa_referencia > 0),
    fecha TEXT NOT NULL,
    fecha_limite TEXT,
    nota TEXT,
    cerrada INTEGER NOT NULL DEFAULT 0 CHECK (cerrada IN (0, 1)),
    creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE transacciones_v6 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('GASTO', 'INGRESO', 'TRANSFERENCIA', 'APORTE_META', 'RETIRO_META',
      'PRESTAMO_DADO', 'PRESTAMO_RECIBIDO', 'COBRO_DEUDA', 'PAGO_DEUDA')),
    monto INTEGER NOT NULL CHECK (monto > 0),
    fecha TEXT NOT NULL,
    categoria_id INTEGER REFERENCES categorias (id) ON DELETE RESTRICT,
    billetera_origen_id INTEGER NOT NULL REFERENCES billeteras (id) ON DELETE RESTRICT,
    billetera_destino_id INTEGER REFERENCES billeteras (id) ON DELETE RESTRICT,
    meta_id INTEGER REFERENCES metas_ahorro (id) ON DELETE RESTRICT,
    monto_destino INTEGER CHECK (monto_destino IS NULL OR monto_destino > 0),
    tasa_cambio REAL,
    nota TEXT,
    creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    comision_de INTEGER REFERENCES transacciones_v6 (id) ON DELETE CASCADE,
    deuda_id INTEGER REFERENCES deudas (id) ON DELETE CASCADE,
    CHECK (tipo <> 'TRANSFERENCIA' OR (
      billetera_destino_id IS NOT NULL
      AND billetera_destino_id <> billetera_origen_id
      AND monto_destino IS NOT NULL)),
    CHECK (tipo NOT IN ('APORTE_META', 'RETIRO_META') OR (meta_id IS NOT NULL AND monto_destino IS NOT NULL)),
    CHECK (tipo NOT IN ('PRESTAMO_DADO', 'PRESTAMO_RECIBIDO', 'COBRO_DEUDA', 'PAGO_DEUDA')
      OR (deuda_id IS NOT NULL AND monto_destino IS NOT NULL))
  );

  INSERT INTO transacciones_v6 (id, tipo, monto, fecha, categoria_id, billetera_origen_id, billetera_destino_id,
      meta_id, monto_destino, tasa_cambio, nota, creada_en, comision_de)
    SELECT id, tipo, monto, fecha, categoria_id, billetera_origen_id, billetera_destino_id,
      meta_id, monto_destino, tasa_cambio, nota, creada_en, comision_de
    FROM transacciones ORDER BY id;

  DROP TABLE transacciones;
  ALTER TABLE transacciones_v6 RENAME TO transacciones;

  CREATE INDEX idx_transacciones_fecha ON transacciones (fecha);
  CREATE INDEX idx_transacciones_origen ON transacciones (billetera_origen_id);
  CREATE INDEX idx_transacciones_destino ON transacciones (billetera_destino_id);
  CREATE INDEX idx_transacciones_categoria ON transacciones (categoria_id);
  CREATE INDEX idx_transacciones_meta ON transacciones (meta_id);
  CREATE INDEX idx_transacciones_comision ON transacciones (comision_de);
  CREATE INDEX idx_transacciones_deuda ON transacciones (deuda_id);
  `,
  // v7: presupuesto mensual por categoría de gasto.
  `
  CREATE TABLE presupuestos (
    categoria_id INTEGER PRIMARY KEY REFERENCES categorias (id) ON DELETE CASCADE,
    monto INTEGER NOT NULL CHECK (monto > 0),
    moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS', 'USDT'))
  );
  `,
  // v8: gastos e ingresos recurrentes (alquiler, internet, sueldo...).
  `
  CREATE TABLE recurrentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('GASTO', 'INGRESO')),
    monto INTEGER NOT NULL CHECK (monto > 0),
    billetera_id INTEGER NOT NULL REFERENCES billeteras (id) ON DELETE CASCADE,
    categoria_id INTEGER NOT NULL REFERENCES categorias (id) ON DELETE CASCADE,
    frecuencia TEXT NOT NULL CHECK (frecuencia IN ('SEMANAL', 'QUINCENAL', 'MENSUAL')),
    dia_ancla INTEGER NOT NULL CHECK (dia_ancla BETWEEN 1 AND 31),
    proxima_fecha TEXT NOT NULL,
    automatico INTEGER NOT NULL DEFAULT 0 CHECK (automatico IN (0, 1)),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
  );
  `,
  // v9: euros (moneda EUR y tasa del euro BCV) y billeteras que no cuentan en el total.
  // Para cambiar los CHECK se reconstruyen las tablas con las claves foráneas desactivadas
  // (si no, borrar la tabla vieja borraría en cascada los movimientos); ver migrar().
  {
    sinClavesForaneas: true,
    sql: `
  CREATE TABLE billeteras_v9 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS', 'USDT', 'EUR')),
    balance_inicial INTEGER NOT NULL DEFAULT 0,
    icono TEXT NOT NULL DEFAULT 'wallet',
    color_hex TEXT NOT NULL DEFAULT '#2E7D32',
    archivada INTEGER NOT NULL DEFAULT 0 CHECK (archivada IN (0, 1)),
    creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    comision_porcentaje REAL NOT NULL DEFAULT 0 CHECK (comision_porcentaje >= 0),
    comision_minima INTEGER NOT NULL DEFAULT 0 CHECK (comision_minima >= 0),
    margen_cambio REAL,
    en_total INTEGER NOT NULL DEFAULT 1 CHECK (en_total IN (0, 1))
  );
  INSERT INTO billeteras_v9 (id, nombre, moneda, balance_inicial, icono, color_hex, archivada, creada_en,
      comision_porcentaje, comision_minima, margen_cambio)
    SELECT id, nombre, moneda, balance_inicial, icono, color_hex, archivada, creada_en,
      comision_porcentaje, comision_minima, margen_cambio
    FROM billeteras ORDER BY id;
  DROP TABLE billeteras;
  ALTER TABLE billeteras_v9 RENAME TO billeteras;

  CREATE TABLE metas_ahorro_v9 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    monto_objetivo INTEGER NOT NULL CHECK (monto_objetivo > 0),
    moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS', 'USDT', 'EUR')),
    fecha_objetivo TEXT,
    color_hex TEXT NOT NULL DEFAULT '#1565C0',
    archivada INTEGER NOT NULL DEFAULT 0 CHECK (archivada IN (0, 1)),
    creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  INSERT INTO metas_ahorro_v9 (id, nombre, monto_objetivo, moneda, fecha_objetivo, color_hex, archivada, creada_en)
    SELECT id, nombre, monto_objetivo, moneda, fecha_objetivo, color_hex, archivada, creada_en
    FROM metas_ahorro ORDER BY id;
  DROP TABLE metas_ahorro;
  ALTER TABLE metas_ahorro_v9 RENAME TO metas_ahorro;

  CREATE TABLE deudas_v9 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('ME_DEBEN', 'DEBO')),
    persona TEXT NOT NULL,
    moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS', 'USDT', 'EUR')),
    monto INTEGER NOT NULL CHECK (monto > 0),
    tasa_referencia REAL CHECK (tasa_referencia IS NULL OR tasa_referencia > 0),
    fecha TEXT NOT NULL,
    fecha_limite TEXT,
    nota TEXT,
    cerrada INTEGER NOT NULL DEFAULT 0 CHECK (cerrada IN (0, 1)),
    creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  INSERT INTO deudas_v9 (id, tipo, persona, moneda, monto, tasa_referencia, fecha, fecha_limite, nota, cerrada, creada_en)
    SELECT id, tipo, persona, moneda, monto, tasa_referencia, fecha, fecha_limite, nota, cerrada, creada_en
    FROM deudas ORDER BY id;
  DROP TABLE deudas;
  ALTER TABLE deudas_v9 RENAME TO deudas;

  CREATE TABLE presupuestos_v9 (
    categoria_id INTEGER PRIMARY KEY REFERENCES categorias (id) ON DELETE CASCADE,
    monto INTEGER NOT NULL CHECK (monto > 0),
    moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS', 'USDT', 'EUR'))
  );
  INSERT INTO presupuestos_v9 (categoria_id, monto, moneda) SELECT categoria_id, monto, moneda FROM presupuestos;
  DROP TABLE presupuestos;
  ALTER TABLE presupuestos_v9 RENAME TO presupuestos;

  CREATE TABLE tasas_cache_v9 (
    par TEXT PRIMARY KEY CHECK (par IN ('BCV', 'PARALELO', 'EURO')),
    tasa REAL NOT NULL CHECK (tasa > 0),
    ultima_actualizacion TEXT NOT NULL,
    consultada_en TEXT,
    origen TEXT NOT NULL DEFAULT 'API' CHECK (origen IN ('API', 'MANUAL'))
  );
  INSERT INTO tasas_cache_v9 (par, tasa, ultima_actualizacion, consultada_en, origen)
    SELECT par, tasa, ultima_actualizacion, consultada_en, origen FROM tasas_cache;
  DROP TABLE tasas_cache;
  ALTER TABLE tasas_cache_v9 RENAME TO tasas_cache;

  CREATE TABLE historial_tasas_v9 (
    par TEXT NOT NULL CHECK (par IN ('BCV', 'PARALELO', 'EURO')),
    dia TEXT NOT NULL,
    tasa REAL NOT NULL CHECK (tasa > 0),
    PRIMARY KEY (par, dia)
  );
  INSERT INTO historial_tasas_v9 (par, dia, tasa) SELECT par, dia, tasa FROM historial_tasas;
  DROP TABLE historial_tasas;
  ALTER TABLE historial_tasas_v9 RENAME TO historial_tasas;

  -- Para que el histórico (con el euro) se descargue de nuevo al abrir la app.
  DELETE FROM preferencias WHERE clave = 'historico_sincronizado_en';
  `,
  },
  // v10: compras a cuotas (Cashea), movimientos rápidos, foto del comprobante y aportes
  // automáticos a metas (los recurrentes se reconstruyen para aceptar APORTE_META).
  {
    sinClavesForaneas: true,
    sql: `
  CREATE TABLE compras_cuotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comercio TEXT NOT NULL,
    descripcion TEXT,
    total INTEGER NOT NULL CHECK (total > 0),
    inicial INTEGER NOT NULL DEFAULT 0 CHECK (inicial >= 0),
    cuotas INTEGER NOT NULL CHECK (cuotas BETWEEN 1 AND 24),
    dias_entre_cuotas INTEGER NOT NULL DEFAULT 14 CHECK (dias_entre_cuotas > 0),
    fecha TEXT NOT NULL,
    categoria_id INTEGER REFERENCES categorias (id) ON DELETE SET NULL,
    inicial_transaccion_id INTEGER,
    creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  ALTER TABLE transacciones ADD COLUMN compra_id INTEGER REFERENCES compras_cuotas (id) ON DELETE CASCADE;
  ALTER TABLE transacciones ADD COLUMN comprobante TEXT;
  CREATE INDEX idx_transacciones_compra ON transacciones (compra_id);

  CREATE TABLE plantillas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('GASTO', 'INGRESO')),
    monto INTEGER CHECK (monto IS NULL OR monto > 0),
    billetera_id INTEGER NOT NULL REFERENCES billeteras (id) ON DELETE CASCADE,
    categoria_id INTEGER NOT NULL REFERENCES categorias (id) ON DELETE CASCADE,
    icono TEXT NOT NULL DEFAULT 'lightning-bolt'
  );

  CREATE TABLE recurrentes_v10 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('GASTO', 'INGRESO', 'APORTE_META')),
    monto INTEGER NOT NULL CHECK (monto > 0),
    billetera_id INTEGER NOT NULL REFERENCES billeteras (id) ON DELETE CASCADE,
    categoria_id INTEGER REFERENCES categorias (id) ON DELETE CASCADE,
    meta_id INTEGER REFERENCES metas_ahorro (id) ON DELETE CASCADE,
    frecuencia TEXT NOT NULL CHECK (frecuencia IN ('SEMANAL', 'QUINCENAL', 'MENSUAL')),
    dia_ancla INTEGER NOT NULL CHECK (dia_ancla BETWEEN 1 AND 31),
    proxima_fecha TEXT NOT NULL,
    automatico INTEGER NOT NULL DEFAULT 0 CHECK (automatico IN (0, 1)),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    CHECK ((tipo = 'APORTE_META') = (meta_id IS NOT NULL)),
    CHECK (tipo = 'APORTE_META' OR categoria_id IS NOT NULL)
  );
  INSERT INTO recurrentes_v10 (id, nombre, tipo, monto, billetera_id, categoria_id, frecuencia, dia_ancla, proxima_fecha, automatico, activo)
    SELECT id, nombre, tipo, monto, billetera_id, categoria_id, frecuencia, dia_ancla, proxima_fecha, automatico, activo
    FROM recurrentes ORDER BY id;
  DROP TABLE recurrentes;
  ALTER TABLE recurrentes_v10 RENAME TO recurrentes;
  `,
  },
  // v11: dinero de otros guardado en mis billeteras (deudas "ajenas") y ajustes
  // de deuda que no mueven saldos (tomar prestado de ese dinero y devolverlo).
  `
  ALTER TABLE deudas ADD COLUMN ajeno INTEGER NOT NULL DEFAULT 0 CHECK (ajeno IN (0, 1));
  ALTER TABLE deudas ADD COLUMN billetera_id INTEGER REFERENCES billeteras(id) ON DELETE SET NULL;
  ALTER TABLE deudas ADD COLUMN origen_ajeno_id INTEGER REFERENCES deudas(id) ON DELETE SET NULL;
  CREATE TABLE ajustes_deuda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deuda_id INTEGER NOT NULL REFERENCES deudas(id) ON DELETE CASCADE,
    monto INTEGER NOT NULL CHECK (monto <> 0),
    fecha TEXT NOT NULL,
    grupo TEXT NOT NULL,
    nota TEXT
  );
  CREATE INDEX idx_ajustes_deuda ON ajustes_deuda(deuda_id);
  CREATE INDEX idx_ajustes_grupo ON ajustes_deuda(grupo);
  `,
  // v12: dinero que le entra a otra persona en mi cuenta: el ajuste va enlazado
  // al movimiento de entrada y se borra con él.
  `
  ALTER TABLE ajustes_deuda ADD COLUMN transaccion_id INTEGER REFERENCES transacciones(id) ON DELETE CASCADE;
  CREATE INDEX idx_ajustes_transaccion ON ajustes_deuda(transaccion_id);
  `,
];

export const VERSION_ESQUEMA = MIGRACIONES.length;

/** `hasta` solo se usa en pruebas, para simular una base de datos de una versión anterior. */
export async function migrar(db: BaseDatos, hasta = MIGRACIONES.length): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const fila = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const actual = fila?.user_version ?? 0;
  for (let v = actual; v < hasta; v++) {
    const m = MIGRACIONES[v];
    const { sql, sinClavesForaneas = false } = typeof m === 'string' ? { sql: m } : m;
    // Este PRAGMA no tiene efecto dentro de una transacción: va antes del BEGIN.
    if (sinClavesForaneas) await db.execAsync('PRAGMA foreign_keys = OFF;');
    try {
      await db.execAsync(`BEGIN; ${sql}; PRAGMA user_version = ${v + 1};`);
      if (sinClavesForaneas) {
        const rotas = await db.getAllAsync('PRAGMA foreign_key_check', []);
        if (rotas.length > 0) throw new Error(`La migración ${v + 1} dejó referencias rotas.`);
      }
      await db.execAsync('COMMIT;');
    } catch (error) {
      await db.execAsync('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      if (sinClavesForaneas) await db.execAsync('PRAGMA foreign_keys = ON;');
    }
  }
}
