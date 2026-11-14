import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonical, chooseDoc } from '@/domain/syncMerge';

const OLD = '2026-11-01T10:00:00.000Z';
const NEW = '2026-11-05T10:00:00.000Z';
const a = { name: 'Ana', level: 'beginner' };
const b = { name: 'Ana', level: 'intermediate' };

test('la nube más antigua no reemplaza lo del teléfono, y lo local se vuelve a subir', () => {
  assert.deepEqual(chooseDoc({ local: b, cloud: a, localAt: NEW, cloudAt: OLD }), { use: 'local', resend: true });
});

test('la nube más nueva sí reemplaza', () => {
  assert.deepEqual(chooseDoc({ local: a, cloud: b, localAt: OLD, cloudAt: NEW }), { use: 'cloud', resend: false });
});

test('mismo contenido: no se toca nada, aunque las claves vengan en otro orden', () => {
  const cloud = { level: 'beginner', name: 'Ana' };
  assert.deepEqual(chooseDoc({ local: a, cloud, localAt: OLD, cloudAt: NEW }), { use: 'local', resend: false });
  assert.equal(canonical({ x: 1, y: [{ b: 2, a: 1 }], z: undefined }), canonical({ y: [{ a: 1, b: 2 }], x: 1 }));
});

test('misma fecha y distinto contenido: queda lo del teléfono, sin volver a subir', () => {
  assert.deepEqual(chooseDoc({ local: a, cloud: b, localAt: NEW, cloudAt: NEW }), { use: 'local', resend: false });
});

test('la fecha de la base (con microsegundos y zona) se compara bien con la del teléfono', () => {
  const cloudAt = '2026-11-05T10:00:00.000000+00:00';
  assert.equal(chooseDoc({ local: a, cloud: b, localAt: NEW, cloudAt }).use, 'local');
  assert.equal(chooseDoc({ local: a, cloud: b, localAt: OLD, cloudAt }).use, 'cloud');
  assert.equal(chooseDoc({ local: a, cloud: b, localAt: '2026-11-05T07:00:01-03:00', cloudAt }).use, 'local');
});

test('sin fecha en el teléfono se confía en la nube (como antes); sin fecha en la nube, en el teléfono', () => {
  assert.equal(chooseDoc({ local: a, cloud: b, localAt: null, cloudAt: OLD }).use, 'cloud');
  assert.equal(chooseDoc({ local: a, cloud: b, localAt: 'no es fecha', cloudAt: OLD }).use, 'cloud');
  assert.deepEqual(chooseDoc({ local: a, cloud: b, localAt: OLD, cloudAt: null }), { use: 'local', resend: true });
});

test('falta uno de los dos lados', () => {
  assert.deepEqual(chooseDoc({ local: null, cloud: b }), { use: 'cloud', resend: false });
  assert.deepEqual(chooseDoc({ local: a, cloud: null }), { use: 'local', resend: true });
  assert.deepEqual(chooseDoc({ local: null, cloud: null }), { use: 'local', resend: false });
});

test('al entrar a una cuenta que ya existe manda la cuenta, aunque el teléfono sea más nuevo', () => {
  assert.equal(chooseDoc({ local: b, cloud: a, localAt: NEW, cloudAt: OLD, preferCloud: true }).use, 'cloud');
});
