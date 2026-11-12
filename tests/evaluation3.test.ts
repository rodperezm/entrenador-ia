import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES } from '@/data/exercises.seed';
import { cycleInfo, setPlannedHistory, weekKey } from '@/domain/cycle';
import { cantDoIds } from '@/domain/generator';
import { mildPainStreak, progressSlot } from '@/domain/progression';
import type { CantDoReason, LocalProfile, WorkoutSession } from '@/domain/schema';
import { applyDayChoice, defaultWeekConfig, strengthDaysFrom, weekWithStrength } from '@/domain/week';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');
const DAY = 864e5;
const squat = EXERCISES.find((e) => e.id === 'kb_goblet_squat')!;
const profile = {
  level: 'intermediate',
  equipment: ['kettlebell', 'mat', 'chair'],
  parkEquipment: [],
  kettlebellWeightsKg: [8, 12, 16],
  kettlebellPairsKg: [],
  dumbbellWeightsKg: [],
  dumbbellPairsKg: [],
  conditions: [],
  excludedExerciseIds: [],
  updatedAt: new Date(NOW - 60 * DAY).toISOString(),
} as unknown as LocalProfile;

const session = (daysAgo: number, painLevel: number, extra: Partial<WorkoutSession> = {}): WorkoutSession => {
  const t = new Date(NOW - daysAgo * DAY).toISOString();
  return {
    id: 's' + daysAgo,
    day: 'mon',
    location: 'home',
    startedAt: t,
    finishedAt: t,
    completed: true,
    sets: [1, 2, 3].map((setNo) => ({
      exerciseId: squat.id,
      setNo,
      targetReps: 10,
      repsDone: 10,
      durationSec: null,
      weightKg: 16,
      rpe: 7,
      painFlag: painLevel >= 2,
      painLevel,
    })),
    ...extra,
  };
};
const slot = { exerciseId: squat.id, sets: 3, reps: 10, durationSec: null, weightKg: 16, restSec: 90, rationale: null };

test('una o dos molestias leves mantienen la carga; la tercera seguida la baja', () => {
  assert.equal(mildPainStreak(squat.id, [session(2, 1), session(5, 1)]), false);
  assert.equal(progressSlot(slot, squat, profile, [session(2, 1), session(5, 1)]).weightKg, 16);

  const three = [session(2, 1), session(5, 1), session(8, 1)];
  assert.equal(mildPainStreak(squat.id, three), true);
  const lowered = progressSlot(slot, squat, profile, three);
  assert.equal(lowered.weightKg, 12);
  assert.match(lowered.rationale ?? '', /tres veces seguidas/);
});

test('una sesión sin molestia entre medio corta la racha', () => {
  assert.equal(mildPainStreak(squat.id, [session(2, 1), session(5, 0), session(8, 1), session(11, 1)]), false);
});

const marked = (daysAgo: number, reason: CantDoReason) =>
  session(daysAgo, 0, { cantDo: [{ exerciseId: squat.id, reason, replacedBy: null }] });

test('«No puedo hacerlo»: el plazo depende del motivo', () => {
  // No lo conocía: vuelve a las 2 semanas. Muy difícil o inseguro: un ciclo.
  assert.deepEqual(cantDoIds([marked(10, 'dont_know')], NOW), [squat.id]);
  assert.deepEqual(cantDoIds([marked(15, 'dont_know')], NOW), []);
  assert.deepEqual(cantDoIds([marked(20, 'too_hard')], NOW), [squat.id]);
  assert.deepEqual(cantDoIds([marked(20, 'not_safe')], NOW), [squat.id]);
  assert.deepEqual(cantDoIds([marked(29, 'too_hard')], NOW), []);
});

test('«el lugar no me lo permite» se levanta si después cambió su perfil', () => {
  const history = [marked(5, 'no_place')];
  assert.deepEqual(cantDoIds(history, NOW, new Date(NOW - 10 * DAY).toISOString()), [squat.id]);
  assert.deepEqual(cantDoIds(history, NOW, new Date(NOW - 2 * DAY).toISOString()), []);
  // Otros motivos no dependen del perfil.
  assert.deepEqual(cantDoIds([marked(5, 'too_hard')], NOW, new Date(NOW - 2 * DAY).toISOString()), [squat.id]);
});

test('una semana pasada se juzga con los días que tenía planificados entonces', () => {
  const daysOf = (n: number) => {
    const choices = weekWithStrength(strengthDaysFrom(n, 'mon'));
    return defaultWeekConfig().days.map((d) => applyDayChoice(d, choices[d.day]));
  };
  const today = new Date('2026-11-12T12:00:00');
  const monday = (weeksAgo: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - weeksAgo * 7);
    d.setHours(10, 0, 0, 0);
    return d;
  };
  const at = (weeksAgo: number): WorkoutSession => {
    const d = monday(weeksAgo);
    return { ...session(0, 0), id: `w${weeksAgo}`, startedAt: d.toISOString(), finishedAt: d.toISOString() };
  };
  // Entrenó 1 día en cada una de las dos semanas pasadas. Hoy tiene 6 días planificados.
  const history = [at(1), at(2)];
  try {
    // Sin registro: con 6 días hoy se exigen 3 por semana, y ninguna semana pasada cuenta.
    setPlannedHistory({});
    assert.equal(cycleInfo(history, 'intermediate', daysOf(6), today).week, 1);
    // Con registro: esas semanas tenía 2 días planificados (basta 1), así que las dos cuentan.
    setPlannedHistory({ [weekKey(monday(1))]: 2, [weekKey(monday(2))]: 2 });
    assert.equal(cycleInfo(history, 'intermediate', daysOf(6), today).week, 3);
  } finally {
    setPlannedHistory({});
  }
});
