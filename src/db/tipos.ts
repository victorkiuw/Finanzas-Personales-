// Subconjunto de la API de expo-sqlite que usa la app. Definirlo aquí permite
// ejecutar la misma lógica de datos en las pruebas con node:sqlite.

export type ValorSQL = string | number | null;

export interface BaseDatos {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: ValorSQL[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, params: ValorSQL[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: ValorSQL[]): Promise<T | null>;
}

/** Ejecuta `tarea` dentro de una transacción; si falla, deshace todo. */
export async function enTransaccion<T>(db: BaseDatos, tarea: () => Promise<T>): Promise<T> {
  await db.execAsync('BEGIN');
  try {
    const resultado = await tarea();
    await db.execAsync('COMMIT');
    return resultado;
  } catch (e) {
    await db.execAsync('ROLLBACK').catch(() => {});
    throw e;
  }
}
