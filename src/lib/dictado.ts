import { parsearMonto, type Moneda } from './moneda';

/*
 * Interpreta un movimiento dictado, sin internet: "Gasté 500 bolívares en
 * comida con Mercantil", "Me pagaron 20 dólares en efectivo", "Pasaje 300".
 * Lo que no entienda queda vacío para completarlo en el formulario.
 */

export interface MovimientoDictado {
  tipo: 'GASTO' | 'INGRESO' | 'TRANSFERENCIA';
  monto: number | null;
  moneda: Moneda | null;
  billeteraId: number | null;
  categoriaId: number | null;
  nota: string;
}

/** Minúsculas y sin acentos, para comparar. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const PALABRAS_INGRESO = ['cobre', 'recibi', 'me pagaron', 'me depositaron', 'me transfirieron', 'ingreso', 'gane', 'vendi', 'me dieron', 'sueldo', 'salario', 'quincena'];
const PALABRAS_TRANSFERENCIA = ['transferi a mi', 'pase a mi', 'pase de', 'cambie', 'movi'];

const MONEDAS: [Moneda, RegExp][] = [
  ['USDT', /\b(usdt|tether|usd t)\b/],
  ['EUR', /\b(euros?|€)/],
  ['BS', /\b(bolivares?|bolos?|bs|bss)\b/],
  ['USD', /\b(dolares?|verdes?|usd|\$)|\$/],
];

/** Palabras que suelen ir con cada categoría (se busca por el nombre de la categoría o por estas). */
const SINONIMOS: Record<string, string[]> = {
  comida: ['almuerzo', 'almorce', 'cena', 'cene', 'desayuno', 'desayune', 'comida', 'comi', 'mercado', 'supermercado', 'panaderia', 'pan', 'charcuteria', 'empanada', 'arepa'],
  transporte: ['pasaje', 'gasolina', 'taxi', 'bus', 'autobus', 'metro', 'uber', 'yummy', 'ridery', 'moto taxi', 'mototaxi', 'estacionamiento'],
  servicios: ['luz', 'agua', 'internet', 'telefono', 'recarga', 'saldo', 'cantv', 'gas', 'aseo', 'condominio'],
  hogar: ['alquiler', 'casa', 'hogar', 'limpieza'],
  salud: ['farmacia', 'medicina', 'medicinas', 'medico', 'doctor', 'consulta', 'clinica', 'pastillas'],
  ocio: ['cine', 'salida', 'fiesta', 'rumba', 'cerveza', 'cervezas', 'juego', 'netflix', 'spotify'],
  educacion: ['universidad', 'curso', 'colegio', 'libro', 'libros', 'matricula'],
  ropa: ['ropa', 'zapatos', 'camisa', 'pantalon', 'franela'],
  comisiones: ['comision'],
  salario: ['sueldo', 'salario', 'quincena', 'nomina'],
  freelance: ['freelance', 'trabajo extra', 'cliente', 'proyecto'],
  ventas: ['venta', 'vendi'],
  regalos: ['regalo', 'regalaron'],
};

/** Primer monto del texto: "500", "1.500", "20,50", "5 mil", "2 millones". */
export function extraerMonto(texto: string): number | null {
  const t = normalizar(texto).replace(/\$/g, ' ');
  const m = t.match(/(\d[\d.,]*)\s*(mil|millones|millon)?/);
  if (!m) return null;
  // Al dictar, "1.500" son mil quinientos (punto de miles), no uno coma cinco.
  const numero = /^\d{1,3}(\.\d{3})+$/.test(m[1]) ? m[1].replace(/\./g, '') : m[1].replace(/[.,]$/, '');
  let valor = parsearMonto(numero);
  if (valor === null) return null;
  if (m[2] === 'mil') valor *= 1000;
  else if (m[2]) valor *= 1_000_000;
  return valor > 0 ? valor : null;
}

function contiene(texto: string, palabra: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(texto);
}

export function interpretarDictado(
  texto: string,
  billeteras: { id: number; nombre: string; moneda: Moneda }[],
  categorias: { id: number; nombre: string; tipo: 'GASTO' | 'INGRESO' }[],
): MovimientoDictado {
  const t = normalizar(texto);
  let tipo: MovimientoDictado['tipo'] = 'GASTO';
  if (PALABRAS_TRANSFERENCIA.some((p) => t.includes(p))) tipo = 'TRANSFERENCIA';
  else if (PALABRAS_INGRESO.some((p) => contiene(t, p) || t.startsWith(p))) tipo = 'INGRESO';

  const moneda = MONEDAS.find(([, re]) => re.test(t))?.[0] ?? null;

  // Billetera: la que se nombre; si no, la primera en la moneda dicha.
  let billetera: (typeof billeteras)[number] | undefined = billeteras
    .filter((b) => contiene(t, normalizar(b.nombre)) || normalizar(b.nombre).split(/[\s/]+/).some((p) => p.length > 3 && contiene(t, p)))
    .sort((a, b) => b.nombre.length - a.nombre.length)[0];
  if (!billetera && moneda) billetera = billeteras.find((b) => b.moneda === moneda);
  if (!billetera && /\befectivo\b/.test(t)) billetera = billeteras.find((b) => normalizar(b.nombre).includes('efectivo'));

  let categoriaId: number | null = null;
  if (tipo !== 'TRANSFERENCIA') {
    const delTipo = categorias.filter((c) => c.tipo === tipo);
    const porNombre = delTipo.find((c) => contiene(t, normalizar(c.nombre)));
    const porSinonimo = delTipo.find((c) => (SINONIMOS[normalizar(c.nombre)] ?? []).some((p) => contiene(t, p)));
    categoriaId = (porNombre ?? porSinonimo)?.id ?? null;
  }

  const nota = texto.trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 120);
  return { tipo, monto: extraerMonto(texto), moneda, billeteraId: billetera?.id ?? null, categoriaId, nota };
}
