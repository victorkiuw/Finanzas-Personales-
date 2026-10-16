/*
 * Cifrado de la copia de seguridad con contraseña, en JavaScript puro (sin
 * módulos nativos): la clave sale de la contraseña con PBKDF2-HMAC-SHA256 y
 * los datos se cifran con un flujo SHA-256 en modo contador (como CTR)
 * más un HMAC para detectar contraseña incorrecta o archivo alterado.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 de unos bytes. */
export function sha256(datos: Uint8Array): Uint8Array {
  const largoBits = datos.length * 8;
  const total = (((datos.length + 9 + 63) >> 6) << 6);
  const m = new Uint8Array(total);
  m.set(datos);
  m[datos.length] = 0x80;
  const vista = new DataView(m.buffer);
  vista.setUint32(total - 4, largoBits >>> 0);
  vista.setUint32(total - 8, Math.floor(largoBits / 0x100000000));
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = vista.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }
  const salida = new Uint8Array(32);
  const vs = new DataView(salida.buffer);
  for (let i = 0; i < 8; i++) vs.setUint32(i * 4, h[i]);
  return salida;
}

function unir(...partes: Uint8Array[]): Uint8Array {
  const r = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) {
    r.set(p, o);
    o += p.length;
  }
  return r;
}

/** HMAC-SHA256. */
export function hmac(clave: Uint8Array, datos: Uint8Array): Uint8Array {
  let k = clave.length > 64 ? sha256(clave) : clave;
  const bloque = new Uint8Array(64);
  bloque.set(k);
  k = bloque;
  const ipad = k.map((b) => b ^ 0x36);
  const opad = k.map((b) => b ^ 0x5c);
  return sha256(unir(opad, sha256(unir(ipad, datos))));
}

/** PBKDF2-HMAC-SHA256 con 32 bytes de salida. */
export function pbkdf2(contrasena: Uint8Array, sal: Uint8Array, iteraciones: number): Uint8Array {
  let u = hmac(contrasena, unir(sal, new Uint8Array([0, 0, 0, 1])));
  const t = u.slice();
  for (let i = 1; i < iteraciones; i++) {
    u = hmac(contrasena, u);
    for (let j = 0; j < 32; j++) t[j] ^= u[j];
  }
  return t;
}

/** Aplica (o quita, es lo mismo) el flujo de cifrado HMAC(clave, iv ‖ contador). */
function flujo(clave: Uint8Array, iv: Uint8Array, datos: Uint8Array): Uint8Array {
  const salida = new Uint8Array(datos.length);
  // Bloque de clave = SHA-256(clave ‖ iv ‖ contador): 52 bytes, un solo paso de SHA-256 (rápido en el teléfono).
  const entrada = new Uint8Array(clave.length + iv.length + 4);
  entrada.set(clave);
  entrada.set(iv, clave.length);
  const vista = new DataView(entrada.buffer);
  const posContador = clave.length + iv.length;
  for (let i = 0, bloque = 0; i < datos.length; i += 32, bloque++) {
    vista.setUint32(posContador, bloque);
    const k = sha256(entrada);
    for (let j = 0; j < 32 && i + j < datos.length; j++) salida[i + j] = datos[i + j] ^ k[j];
  }
  return salida;
}

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function aBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63] + (i + 1 < b.length ? ALFABETO[(n >> 6) & 63] : '=') + (i + 2 < b.length ? ALFABETO[n & 63] : '=');
  }
  return s;
}

export function deBase64(s: string): Uint8Array {
  const limpio = s.replace(/[^A-Za-z0-9+/]/g, '');
  const salida = new Uint8Array(Math.floor((limpio.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < limpio.length; i += 4) {
    const n = (ALFABETO.indexOf(limpio[i]) << 18) | (ALFABETO.indexOf(limpio[i + 1]) << 12) | ((ALFABETO.indexOf(limpio[i + 2]) & 63) << 6) | (ALFABETO.indexOf(limpio[i + 3]) & 63);
    salida[o++] = (n >> 16) & 255;
    if (limpio[i + 2] !== undefined && o < salida.length) salida[o++] = (n >> 8) & 255;
    if (limpio[i + 3] !== undefined && o < salida.length) salida[o++] = n & 255;
  }
  return salida.slice(0, o);
}

/** Texto a bytes UTF-8 (sin depender de TextEncoder, que no siempre está en el teléfono). */
export function utf8(texto: string): Uint8Array {
  const salida: number[] = [];
  for (const caracter of texto) {
    const c = caracter.codePointAt(0)!;
    if (c < 0x80) salida.push(c);
    else if (c < 0x800) salida.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) salida.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else salida.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(salida);
}

/** Bytes UTF-8 a texto. */
export function deUtf8(b: Uint8Array): string {
  const partes: string[] = [];
  let codigos: number[] = [];
  for (let i = 0; i < b.length; ) {
    const x = b[i];
    let c: number;
    if (x < 0x80) {
      c = x;
      i += 1;
    } else if (x < 0xe0) {
      c = ((x & 31) << 6) | (b[i + 1] & 63);
      i += 2;
    } else if (x < 0xf0) {
      c = ((x & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63);
      i += 3;
    } else {
      c = ((x & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63);
      i += 4;
    }
    codigos.push(c);
    if (codigos.length >= 4096) {
      partes.push(String.fromCodePoint(...codigos));
      codigos = [];
    }
  }
  partes.push(String.fromCodePoint(...codigos));
  return partes.join('');
}

export interface Cifrado {
  v: 1;
  iteraciones: number;
  sal: string;
  iv: string;
  datos: string;
  mac: string;
}

export class ErrorContrasena extends Error {}

const ITERACIONES = 15000;

function claves(contrasena: string, sal: Uint8Array, iteraciones: number) {
  const maestra = pbkdf2(utf8(contrasena), sal, iteraciones);
  return { cifrar: hmac(maestra, utf8('cifrar')), firmar: hmac(maestra, utf8('firmar')) };
}

/** Cifra un texto con una contraseña. `aleatorio(n)` da n bytes al azar (expo-crypto en la app). */
export function cifrarTexto(texto: string, contrasena: string, aleatorio: (n: number) => Uint8Array): Cifrado {
  const sal = aleatorio(16);
  const iv = aleatorio(16);
  const { cifrar, firmar } = claves(contrasena, sal, ITERACIONES);
  const datos = flujo(cifrar, iv, utf8(texto));
  return { v: 1, iteraciones: ITERACIONES, sal: aBase64(sal), iv: aBase64(iv), datos: aBase64(datos), mac: aBase64(hmac(firmar, unir(iv, datos))) };
}

/** Descifra; lanza ErrorContrasena si la contraseña no es la correcta o el archivo cambió. */
export function descifrarTexto(c: Cifrado, contrasena: string): string {
  const sal = deBase64(c.sal);
  const iv = deBase64(c.iv);
  const datos = deBase64(c.datos);
  const { cifrar, firmar } = claves(contrasena, sal, c.iteraciones);
  const esperado = aBase64(hmac(firmar, unir(iv, datos)));
  if (esperado !== c.mac) throw new ErrorContrasena('La contraseña no es correcta.');
  return deUtf8(flujo(cifrar, iv, datos));
}

/** ¿Es un archivo de copia cifrada (el JSON tiene el campo `cifrado`)? */
export function esCopiaCifrada(json: unknown): json is { app: string; cifrado: Cifrado } {
  const c = (json as { cifrado?: Partial<Cifrado> } | null)?.cifrado;
  return !!c && typeof c === 'object' && c.v === 1 && typeof c.datos === 'string' && typeof c.mac === 'string';
}
