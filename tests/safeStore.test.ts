import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBody } from '@/domain/body';
import { WorkoutSession } from '@/domain/schema';
import { bakKey, loadSafely, pendingKey, persistSafely, salvageList } from '@/lib/safeStore';
import { memoryKV } from './memoryKV';

const KEY = 'history.v1';
const session = (id: string, extra: object = {}) => ({
  id,
  day: 'mon',
  location: 'home',
  startedAt: '2026-11-02T10:00:00.000Z',
  finishedAt: '2026-11-02T10:40:00.000Z',
  completed: true,
  sets: [],
  ...extra,
});
const parse = (json: unknown) => salvageList(json, WorkoutSession);

test('lista válida: se carga completa, sin copia', async () => {
  const { kv, data } = memoryKV({ [KEY]: JSON.stringify([session('a'), session('b')]) });
  const res = await loadSafely(kv, KEY, parse);
  assert.equal(res.value?.length, 2);
  assert.deepEqual([res.dropped, res.safe], [0, true]);
  assert.equal(data.has(bakKey(KEY)), false);
});

test('un registro inválido: se conservan los válidos y queda la copia del original', async () => {
  const raw = JSON.stringify([session('a'), session('malo', { day: 'lunes' }), session('c')]);
  const { kv, data } = memoryKV({ [KEY]: raw });
  const res = await loadSafely(kv, KEY, parse);
  assert.deepEqual(res.value?.map((s) => s.id), ['a', 'c']);
  assert.deepEqual([res.dropped, res.safe], [1, true]);
  assert.equal(data.get(bakKey(KEY)), raw);
});

test('JSON roto: no se pierde, queda en la copia', async () => {
  const { kv, data } = memoryKV({ [KEY]: '[{"id":"a"' });
  const res = await loadSafely(kv, KEY, parse);
  assert.deepEqual([res.value, res.safe], [null, true]);
  assert.equal(data.get(bakKey(KEY)), '[{"id":"a"');
});

test('la primera copia no se pisa: una segunda distinta va a .bak.1', async () => {
  const raw = JSON.stringify([session('malo', { day: 'x' })]);
  const { kv, data } = memoryKV({ [KEY]: raw, [bakKey(KEY)]: 'copia anterior' });
  await loadSafely(kv, KEY, parse);
  assert.equal(data.get(bakKey(KEY)), 'copia anterior');
  assert.equal(data.get(bakKey(KEY) + '.1'), raw);
});

test('no se pudo leer: la carga no es segura y lo nuevo se guarda aparte', async () => {
  const raw = JSON.stringify([session('a')]);
  const { kv, data, fail } = memoryKV({ [KEY]: raw });
  fail.read.add(KEY);
  const res = await loadSafely(kv, KEY, parse, 1);
  assert.deepEqual([res.value, res.safe], [null, false]);
  await persistSafely(kv, KEY, [session('nueva')], res.safe);
  assert.equal(data.get(KEY), raw, 'la clave principal queda intacta');
  assert.equal(JSON.parse(data.get(pendingKey(KEY))!)[0].id, 'nueva');

  // En la siguiente apertura ya se puede leer: lo guardado aparte vuelve para combinarse.
  fail.read.clear();
  const next = await loadSafely(kv, KEY, parse);
  assert.deepEqual([next.value?.[0].id, next.pending?.[0].id, next.safe], ['a', 'nueva', true]);
  await persistSafely(kv, KEY, [...next.pending!, ...next.value!], next.safe);
  assert.equal(JSON.parse(data.get(KEY)!).length, 2);
  assert.equal(data.has(pendingKey(KEY)), false);
});

test('no se pudo dejar la copia: no se permite sobrescribir', async () => {
  const raw = JSON.stringify([session('a'), session('malo', { day: 'x' })]);
  const { kv, data, fail } = memoryKV({ [KEY]: raw });
  fail.write.add(bakKey(KEY));
  const res = await loadSafely(kv, KEY, parse);
  assert.deepEqual([res.value?.length, res.safe], [1, false]);
  await persistSafely(kv, KEY, res.value, res.safe);
  assert.equal(data.get(KEY), raw);
});

test('una falla pasajera de lectura se reintenta', async () => {
  const { kv, fail } = memoryKV({ [KEY]: JSON.stringify([session('a')]) });
  fail.read.add(KEY);
  setTimeout(() => fail.read.clear(), 5);
  const res = await loadSafely(kv, KEY, parse, 20);
  assert.deepEqual([res.value?.length, res.safe], [1, true]);
});

test('medidas: un registro inválido o una lista dañada no botan lo demás', () => {
  const tape = { id: 'r1', date: '2026-11-01', weightKg: 80 };
  const bad = parseBody({ records: [tape, { id: 'r2' }], folds: 'dañado' });
  assert.ok(bad);
  assert.equal(bad.dropped >= 1, true);
  assert.equal(parseBody('texto'), null);
  assert.equal(parseBody({}), null);
});
