import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES } from '@/data/exercises.seed';
import { heavierKettlebellAdvice } from '@/domain/kettlebellAdvice';
import type { WorkoutSession } from '@/domain/schema';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');
const DAY = 864e5;
const squat = EXERCISES.find((e) => e.id === 'kb_goblet_squat')!;
const TOP = squat.prescription.repRange!.max;
const session = (daysAgo: number, extra: Partial<WorkoutSession['sets'][number]> = {}): WorkoutSession => {
  const t = new Date(NOW - daysAgo * DAY).toISOString();
  return {
    id: 's' + daysAgo,
    day: 'mon',
    location: 'home',
    startedAt: t,
    finishedAt: t,
    completed: true,
    sets: [1, 2, 3].map((setNo) => ({
      exerciseId: 'kb_goblet_squat',
      setNo,
      targetReps: TOP,
      repsDone: TOP,
      durationSec: null,
      weightKg: 16,
      rpe: 6,
      painFlag: false,
      painLevel: 0,
      ...extra,
    })),
  };
};
const advise = (history: WorkoutSession[], weights = [8, 16]) =>
  heavierKettlebellAdvice({ history, profile: { kettlebellWeightsKg: weights }, exercises: EXERCISES, now: NOW });

test('dos sesiones seguidas al tope, fáciles y sin dolor, con su pesa más pesada: se sugiere la siguiente', () => {
  const advice = advise([session(2), session(5)]);
  assert.deepEqual([advice?.currentKg, advice?.nextKg], [16, 20]);
  assert.ok(advice!.exercises.includes(squat.name.es));
});

test('una sola sesión no basta', () => assert.equal(advise([session(2)]), null));

test('con esfuerzo alto, sin llegar al tope o con dolor, no se sugiere', () => {
  assert.equal(advise([session(2, { rpe: 9 }), session(5)]), null);
  assert.equal(advise([session(2, { repsDone: TOP - 2 }), session(5)]), null);
  assert.equal(advise([session(2, { painLevel: 2, painFlag: true }), session(5)]), null);
  assert.equal(advise([session(2, { rpe: null }), session(5)]), null);
});

test('si aún tiene una pesa más pesada sin usar, no se sugiere comprar', () => {
  assert.equal(advise([session(2), session(5)], [8, 16, 20]), null);
});

test('sesiones antiguas no cuentan, y sobre 32 kg no hay sugerencia', () => {
  assert.equal(advise([session(40), session(45)]), null);
  assert.equal(advise([session(2, { weightKg: 32 }), session(5, { weightKg: 32 })], [32]), null);
});
