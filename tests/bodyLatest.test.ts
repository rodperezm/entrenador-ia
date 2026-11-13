import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcIndices, latestBody, latestRecord, mergeIntoDay, type TapeRecord, weightSeries } from '@/domain/body';

const rec = (id: string, date: string, v: Partial<TapeRecord>): TapeRecord => ({
  id,
  date,
  weightKg: null,
  chestCm: null,
  waistCm: null,
  abdomenCm: null,
  hipCm: null,
  ...v,
});

const records = [
  rec('c', '2026-11-12', { weightKg: 79 }),
  rec('b', '2026-11-05', { weightKg: 80, waistCm: 90, hipCm: 100 }),
  rec('a', '2026-10-20', { weightKg: 81, waistCm: 92 }),
];

test('un registro solo de peso no borra las medidas de cinta anteriores', () => {
  const last = latestBody(records);
  assert.deepEqual(last.weightKg, { value: 79, date: '2026-11-12', prev: 80, prevDate: '2026-11-05' });
  assert.deepEqual(last.waistCm, { value: 90, date: '2026-11-05', prev: 92, prevDate: '2026-10-20' });
  assert.equal(last.chestCm, null);
});

test('los índices usan lo último de cada medida', () => {
  const idx = calcIndices(latestRecord(latestBody(records)), 180);
  assert.equal(idx.icc, 0.9);
  assert.ok(idx.imc && Math.abs(idx.imc - 79 / 3.24) < 1e-9);
});

test('la serie de pesos va del más antiguo al más reciente', () => {
  assert.deepEqual(
    weightSeries(records).map((p) => p.kg),
    [81, 80, 79],
  );
});

test('guardar el peso de un día que ya tenía medidas las conserva', () => {
  const merged = mergeIntoDay(records, '2026-11-05', { weightKg: 79.5, waistCm: null });
  assert.equal(merged.id, 'b');
  assert.equal(merged.weightKg, 79.5);
  assert.equal(merged.waistCm, 90);
  const fresh = mergeIntoDay(records, '2026-11-13', { weightKg: 78 });
  assert.equal(fresh.id, undefined);
  assert.equal(fresh.weightKg, 78);
});
