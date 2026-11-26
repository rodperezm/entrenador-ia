import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FoldRecord, TapeRecord } from '@/domain/body';
import { historyDays, weekday } from '@/domain/bodyHistory';

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
const fold = (id: string, date: string, pecho: number[], abdomen: number[], muslo: number[]): FoldRecord => ({
  id,
  date,
  sex: 'male',
  sites: { pecho, abdomen, muslo },
});

const records = [
  rec('a', '2026-10-31', { weightKg: 102 }),
  rec('b', '2026-11-11', { weightKg: 100.4, chestCm: 113, waistCm: 105 }),
  rec('c', '2026-11-17', { weightKg: 100.6, chestCm: 112 }),
];
const folds = [
  fold('1', '2026-11-11', [42, 42, 42], [49, 50, 51], [19, 20, 21]),
  fold('2', '2026-11-17', [34, 34, 34], [53, 53, 53], [18, 18, 18]),
];
const birth = '1977-03-06';

test('historial: un día por fila, del más reciente al más antiguo, con peso, cinta y pliegues juntos', () => {
  const days = historyDays(records, folds, birth);
  assert.deepEqual(
    days.map((d) => [d.date, d.recordIds, d.foldIds]),
    [
      ['2026-11-17', ['c'], ['2']],
      ['2026-11-11', ['b'], ['1']],
      ['2026-10-31', ['a'], []],
    ],
  );
});

test('historial: cada dato se compara con su medición anterior, aunque sea de otro día', () => {
  const [d17, d11, d31] = historyDays(records, folds, birth);
  assert.deepEqual(d17.tape.weightKg, { value: 100.6, prev: 100.4 });
  assert.deepEqual(d17.tape.chestCm, { value: 112, prev: 113 });
  assert.equal(d17.tape.waistCm, undefined); // ese día no se midió
  assert.deepEqual(d11.tape.weightKg, { value: 100.4, prev: 102 });
  assert.deepEqual(d31.tape.weightKg, { value: 102, prev: null });
});

test('historial: pliegues con su promedio, % de grasa y kilos de grasa y masa magra', () => {
  const [d17, d11] = historyDays(records, folds, birth);
  assert.deepEqual(
    d17.fold?.sites.map((s) => [s.label, s.mm, s.prev]),
    [
      ['Pecho', 34, 42],
      ['Abdomen', 53, 50],
      ['Muslo', 18, 20],
    ],
  );
  assert.equal(Math.round((d17.fold?.pct?.value ?? 0) * 10) / 10, 31.7);
  assert.equal(Math.round((d17.fold?.pct?.prev ?? 0) * 10) / 10, 33.3);
  assert.equal(Math.round((d17.fold?.fatKg ?? 0) * 10) / 10, 31.9);
  assert.equal(d11.fold?.pct?.prev, null);
});

test('historial: día de la semana', () => {
  assert.equal(weekday('2026-11-17'), 'martes');
  assert.equal(weekday('2026-11-01'), 'domingo');
});
