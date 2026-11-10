import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashData, hashText, migrateSent, parseSent } from '@/lib/itemHash';

test('la huella es corta, estable y cambia con el dato', () => {
  const a = { id: 's1', sets: [1, 2, 3] };
  assert.equal(hashData(a), hashData({ id: 's1', sets: [1, 2, 3] }));
  assert.notEqual(hashData(a), hashData({ id: 's1', sets: [1, 2, 4] }));
  assert.ok(hashData(a).length <= 16);
  assert.match(hashData(a), /^h1:[0-9a-z]+$/);
});

test('la huella del dato es la de su texto (así migra el formato anterior)', () => {
  const data = { day: 'mon', sets: [{ reps: 8 }] };
  assert.equal(hashData(data), hashText(JSON.stringify(data)));
  assert.equal(hashData('texto'), hashText('"texto"'));
});

test('cloud-sent.v1 con JSON completo pasa a huellas sin marcar nada como cambiado', () => {
  const items = { 'session:s1': { id: 's1', sets: [] }, 'profile:me': { displayName: 'Ana' } };
  const legacy = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, JSON.stringify(v)]));
  const migrated = migrateSent(legacy);
  for (const [key, data] of Object.entries(items)) assert.equal(migrated[key], hashData(data));
  // Ya migrado, no cambia; y las claves se conservan (de ellas depende saber qué se borró).
  assert.deepEqual(migrateSent(migrated), migrated);
  assert.deepEqual(Object.keys(migrated), Object.keys(legacy));
});

test('lo guardado ilegible no rompe: se parte de cero', () => {
  assert.deepEqual(parseSent('{roto'), {});
  assert.deepEqual(parseSent(null), {});
  assert.deepEqual(parseSent('[1,2]'), {});
});

test('con miles de datos distintos no hay huellas repetidas', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20000; i++) seen.add(hashData({ id: `s${i}`, n: i % 7 }));
  assert.equal(seen.size, 20000);
});
