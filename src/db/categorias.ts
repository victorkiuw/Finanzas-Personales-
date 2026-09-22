import type { BaseDatos } from './tipos';

export type TipoCategoria = 'GASTO' | 'INGRESO';

export interface Categoria {
  id: number;
  nombre: string;
  tipo: TipoCategoria;
  color_hex: string;
  icono: string;
}

export async function listarCategorias(db: BaseDatos, tipo?: TipoCategoria): Promise<Categoria[]> {
  return db.getAllAsync<Categoria>(
    `SELECT id, nombre, tipo, color_hex, icono FROM categorias
     ${tipo ? 'WHERE tipo = ?' : ''} ORDER BY tipo, id`,
    tipo ? [tipo] : [],
  );
}
