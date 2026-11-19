import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { generateDayByRules, strengthGroups, weekLocks } from '@/domain/generator';
import { progressSummary } from '@/domain/progress';
import { lastSessionOf } from '@/domain/progression';
import type { DayOfWeek, DayPlan, LocalProfile, SetLog, WeekConfig, WorkoutSession } from '@/domain/schema';
import { strengthRole } from '@/domain/strength';
import { applyDayChoice, defaultWeekConfig } from '@/domain/week';

// Día elegido por la persona: cambia las zonas de Fuerza de un día, ese día se arma con ellas
// (bajo su responsabilidad) y no cuenta para su progresión; el dolor que marque sí cuenta.

const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const week: WeekConfig = {
  days: defaultWeekConfig().days.map((d) => applyDayChoice(d, DAYS.indexOf(d.day) < 3 ? ['main'] : [])),
};
const cfg = week.days[0];
const profile = (excluded: string[] = []) =>
  ({
    displayName: 'P',
    level: 'intermediate',
    equipment: ['kettlebell', 'mat', 'chair'],
    parkEquipment: [],
    kettlebellWeightsKg: [8, 12, 16],
    kettlebellPairsKg: [],
    dumbbellWeightsKg: [],
    dumbbellPairsKg: [],
    conditions: [],
    excludedExerciseIds: excluded,
    updatedAt: 'x',
    disclaimerAcceptedAt: 'x',
  }) as unknown as LocalProfile;
const mainIds = (d: DayPlan) =>
  d.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots.map((s) => s.exerciseId));

test('con zonas elegidas, la fuerza sale de esas zonas aunque el día tuviera fijos', () => {
  const rules = generateDayByRules(cfg, [], profile(), EXERCISES, [], 7, [], week.days);
  const locked = mainIds(rules);
  // Sin elegir zonas, rehacer conserva los fijos.
  assert.deepEqual(mainIds(generateDayByRules(cfg, [], profile(), EXERCISES, [], 9, locked, week.days)), locked);

  const chosen = generateDayByRules(cfg, [], profile(), EXERCISES, [], 9, locked, week.days, false, [
    'shoulders',
    'arms',
  ]);
  const ids = mainIds(chosen);
  assert.ok(ids.length > 0);
  // La zona principal de cada ejercicio es una de las elegidas.
  for (const id of ids) {
    const main = EXERCISES_BY_ID.get(id)!.muscleGroups[0];
    assert.ok(main === 'shoulders' || main === 'arms', `${id} no es principalmente de hombro ni brazos`);
  }
  assert.deepEqual(chosen.chosenGroups, ['shoulders', 'arms']);
  assert.equal(rules.chosenGroups, undefined);
});

test('las zonas elegidas no saltan los cuidados: lo excluido no vuelve', () => {
  const first = mainIds(generateDayByRules(cfg, [], profile(), EXERCISES, [], 9, [], week.days, false, ['shoulders']));
  const again = generateDayByRules(cfg, [], profile([first[0]]), EXERCISES, [], 9, [], week.days, false, [
    'shoulders',
  ]);
  assert.ok(!mainIds(again).includes(first[0]));
});

test('las zonas propuestas son las que trabajan los ejercicios del día', () => {
  const rules = generateDayByRules(cfg, [], profile(), EXERCISES, [], 7, [], week.days);
  const slots = rules.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots);
  const groups = strengthGroups(slots, EXERCISES_BY_ID);
  assert.deepEqual(
    [...groups].sort(),
    [...new Set(slots.map((s) => EXERCISES_BY_ID.get(s.exerciseId)!.muscleGroups[0]))].sort(),
  );
});

test('un día elegido deja como fijos los ejercicios que había propuesto la app', () => {
  const rules = generateDayByRules(cfg, [], profile(), EXERCISES, [], 7, [], week.days);
  const proposedMain = rules.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots);
  const chosen = generateDayByRules(cfg, [], profile(), EXERCISES, [], 9, [], week.days, false, ['arms']);
  const day = { ...chosen, proposedGroups: strengthGroups(proposedMain, EXERCISES_BY_ID), proposedMain };
  const plan = {
    days: [day],
    summary: '',
    generatedAt: new Date().toISOString(),
    generator: 'rules' as const,
    configHash: 'x',
    cycleBlock: 'b',
  };
  assert.deepEqual(
    weekLocks(plan, 'b', EXERCISES, week.days).lockedByDay.mon,
    proposedMain.map((s) => s.exerciseId),
  );
});

const strengthId = EXERCISES.find((e) => e.blockTypes.includes('main_strength') && strengthRole(e) === 'B')!.id;
const log = (painLevel = 0): SetLog => ({
  exerciseId: strengthId,
  setNo: 1,
  targetReps: 8,
  repsDone: 8,
  durationSec: null,
  weightKg: 16,
  rpe: 7,
  painFlag: painLevel >= 2,
  painLevel,
});
const session = (id: string, chosenByUser: boolean, painLevel = 0, daysAgo = 0): WorkoutSession => {
  const when = new Date(Date.UTC(2026, 10, 18 - daysAgo, 12)).toISOString();
  return {
    id,
    day: 'thu',
    location: 'home',
    startedAt: when,
    finishedAt: when,
    completed: true,
    sets: [log(painLevel)],
    ...(chosenByUser ? { chosenByUser } : {}),
  };
};

test('la progresión salta el día elegido, salvo que haya dolido', () => {
  const regular = session('a', false, 0, 2);
  assert.equal(lastSessionOf(strengthId, [session('b', true), regular])?.session.id, 'a');
  assert.equal(lastSessionOf(strengthId, [session('c', true, 2), regular])?.session.id, 'c');
});

test('el día elegido cuenta como sesión, pero no para «mejoraste»', () => {
  const p = progressSummary([session('a', false, 0, 2), session('b', true)], EXERCISES, new Date(2026, 10, 18, 18));
  assert.equal(p.thisWeek, 2);
  assert.equal(p.exercises.find((e) => e.id === strengthId)?.sessions, 1);
});
