import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES } from '@/data/exercises.seed';
import { PROGRESS_WEEKS, progressSummary } from '@/domain/progress';
import type { WorkoutSession } from '@/domain/schema';

// Miércoles 11-11-2026 al mediodía: la semana en curso empezó el lunes 9.
const NOW = new Date(2026, 10, 11, 12);
const at = (daysAgo: number, extra: Partial<WorkoutSession> = {}): WorkoutSession => {
  const when = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
  return { id: `s${daysAgo}`, day: 'mon', location: 'home', startedAt: when, finishedAt: when, completed: true, sets: [], ...extra };
};

test('la constancia cuenta las sesiones de cada una de las últimas semanas, la actual al final', () => {
  const p = progressSummary([at(0), at(1), at(7), at(21)], EXERCISES, NOW);
  assert.equal(p.weeks.length, PROGRESS_WEEKS);
  assert.deepEqual(
    p.weeks.map((w) => w.count),
    [0, 0, 1, 0, 1, 2],
  );
});

test('una sesión de hace más de seis semanas no entra en la constancia', () => {
  const p = progressSummary([at(60)], EXERCISES, NOW);
  assert.equal(
    p.weeks.reduce((n, w) => n + w.count, 0),
    0,
  );
});

test('«cómo responde tu cuerpo» resume lo marcado en las últimas 4 semanas', () => {
  const p = progressSummary(
    [at(0, { feeling: 'right' }), at(3, { feeling: 'wanted_more' }), at(8), at(40, { feeling: 'too_much' })],
    EXERCISES,
    NOW,
  );
  assert.deepEqual(p.body, { sessions: 3, painFree: 3, answered: 2, right: 1, wantedMore: 1, tooMuch: 0 });
});
