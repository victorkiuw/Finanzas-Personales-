import type { BaseDatos } from './tipos';

export async function leerPreferencia(db: BaseDatos, clave: string): Promise<string | null> {
  const fila = await db.getFirstAsync<{ valor: string }>(`SELECT valor FROM preferencias WHERE clave = ?`, [clave]);
  return fila?.valor ?? null;
}

export async function guardarPreferencia(db: BaseDatos, clave: string, valor: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO preferencias (clave, valor) VALUES (?, ?)
     ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor`,
    [clave, valor],
  );
}
