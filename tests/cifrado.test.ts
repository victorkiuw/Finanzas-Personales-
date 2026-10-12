import assert from 'node:assert/strict';
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { aBase64, cifrarTexto, deBase64, descifrarTexto, deUtf8, ErrorContrasena, esCopiaCifrada, hmac, pbkdf2, sha256, utf8 } from '../src/lib/cifrado';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bytes = (s: string) => new TextEncoder().encode(s);

test('SHA-256, HMAC y PBKDF2 iguales a los de Node', () => {
  for (const largo of [0, 1, 55, 56, 63, 64, 65, 200, 1000]) {
    const d = randomBytes(largo);
    assert.equal(hex(sha256(new Uint8Array(d))), createHash('sha256').update(d).digest('hex'));
  }
  const k = randomBytes(80);
  assert.equal(hex(hmac(new Uint8Array(k), bytes('hola'))), createHmac('sha256', k).update('hola').digest('hex'));
  assert.equal(hex(pbkdf2(bytes('clave'), bytes('sal'), 50)), pbkdf2Sync('clave', 'sal', 50, 32, 'sha256').toString('hex'));
});

test('base64 ida y vuelta', () => {
  for (const largo of [0, 1, 2, 3, 4, 31, 100]) {
    const d = new Uint8Array(randomBytes(largo));
    assert.equal(aBase64(d), Buffer.from(d).toString('base64'));
    assert.deepEqual(deBase64(aBase64(d)), d);
  }
});

test('cifrar y descifrar la copia con contraseña', () => {
  const texto = JSON.stringify({ app: 'finanzas', ñandú: '€ 1.000', lista: Array.from({ length: 50 }, (_, i) => i) });
  const c = cifrarTexto(texto, 'mi clave', (n) => new Uint8Array(randomBytes(n)));
  assert.ok(!c.datos.includes('finanzas'));
  assert.equal(descifrarTexto(c, 'mi clave'), texto);
  assert.throws(() => descifrarTexto(c, 'otra'), ErrorContrasena);
});

test('UTF-8 propio igual al de Node (acentos, ñ, emojis)', () => {
  const texto = 'Café ñandú €100 — 💸 "Bs." ü';
  assert.equal(hex(utf8(texto)), Buffer.from(texto, 'utf8').toString('hex'));
  assert.equal(deUtf8(utf8(texto)), texto);
  const largo = 'á'.repeat(10000) + '😀'.repeat(3000);
  assert.equal(deUtf8(utf8(largo)), largo);
});

test('reconoce una copia cifrada', () => {
  const c = cifrarTexto('{}', 'x', (n) => new Uint8Array(randomBytes(n)));
  assert.equal(esCopiaCifrada({ app: 'finanzas-personales', cifrado: c }), true);
  assert.equal(esCopiaCifrada({ app: 'finanzas-personales', tablas: {} }), false);
  assert.equal(esCopiaCifrada(null), false);
});
