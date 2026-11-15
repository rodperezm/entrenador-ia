import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recentPain } from '@/domain/finisher';
import type { WorkoutSession } from '@/domain/schema';

// Con dolor reciente no se ofrecen cierres HIIT ni AMRAP. Antes solo contaba el dolor marcado en una
// serie; llegar a entrenar con dolor, o amanecer peor al día siguiente, no lo frenaba.
const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const session = (daysAgo: number, extra: Partial<WorkoutSession>): WorkoutSession =>
  ({
    id: `s-${daysAgo}`,
    day: 'mon',
    location: 'home',
    startedAt: new Date(NOW - daysAgo * 864e5).toISOString(),
    finishedAt: new Date(NOW - daysAgo * 864e5).toISOString(),
    completed: true,
    sets: [],
    ...extra,
  }) as WorkoutSession;

test('llegar con dolor moderado o fuerte cuenta como dolor reciente', () => {
  assert.equal(recentPain([session(2, { checkIn: { arrival: 'pain', painZone: 'low_back', painLevel: 2 } })], NOW), true);
  assert.equal(recentPain([session(2, { checkIn: { arrival: 'pain', painZone: 'knee' } })], NOW), true);
});

test('una molestia leve al llegar, o que ya pasó hace más de una semana, no frena el cierre', () => {
  assert.equal(recentPain([session(2, { checkIn: { arrival: 'pain', painZone: 'knee', painLevel: 1 } })], NOW), false);
  assert.equal(recentPain([session(9, { checkIn: { arrival: 'pain', painZone: 'knee', painLevel: 3 } })], NOW), false);
  assert.equal(recentPain([session(2, { checkIn: { arrival: 'tired' } })], NOW), false);
});

test('amanecer peor al día siguiente cuenta como dolor reciente', () => {
  assert.equal(recentPain([session(3, { painFollowUp: 'worse' })], NOW), true);
  assert.equal(recentPain([session(3, { painFollowUp: 'better' })], NOW), false);
});
