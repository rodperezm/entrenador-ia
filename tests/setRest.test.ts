import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { guardAiPlan } from '@/domain/aiGuard';
import { MEDICAL_CONDITIONS } from '@/domain/catalog';
import { generateWeekByRules } from '@/domain/generator';
import type { DayOfWeek, ExerciseSlot, GeneratedWeekPlan, LocalProfile, WeekConfig } from '@/domain/schema';
import { minSetRest, SET_REST_SEC, setRestSec, withSetRest } from '@/domain/setRest';
import { partBudgets, slotSeconds } from '@/domain/timeBudget';
import { applyDayChoice, type DayChoice, defaultWeekConfig } from '@/domain/week';

const ex = (id: string) => EXERCISES_BY_ID.get(id)!;
const knee = MEDICAL_CONDITIONS.find((m) => m.id === 'patellofemoral_pain')!;
// Lunes y jueves con Fuerza y elongación, miércoles de lesión con elongación.
const week = (minutes: number): WeekConfig => {
  const choices: Partial<Record<DayOfWeek, DayChoice>> = {
    mon: ['main', 'cooldown'],
    wed: ['prehab', 'cooldown'],
    thu: ['main', 'cooldown'],
  };
  const w = defaultWeekConfig();
  return {
    days: w.days.map((d) => ({ ...applyDayChoice(d, choices[d.day] ?? []), availableMinutes: minutes })),
  };
};
const profile = (level: LocalProfile['level']) =>
  ({
    displayName: 'P',
    level,
    equipment: ['kettlebell', 'mat', 'chair', 'resistance_band'],
    parkEquipment: [],
    kettlebellWeightsKg: [8, 12, 16],
    kettlebellPairsKg: [],
    dumbbellWeightsKg: [],
    dumbbellPairsKg: [],
    conditions: [{ conditionId: 'patellofemoral_pain', activeFlags: knee.suggestedFlags, notes: null }],
    excludedExerciseIds: [],
    updatedAt: 'x',
    disclaimerAcceptedAt: 'x',
  }) as unknown as LocalProfile;

// Todo ejercicio con 2 o más series, fuera de la Fuerza, respeta el mínimo de su tipo.
const assertRested = (plan: GeneratedWeekPlan, label: string) => {
  for (const d of plan.days)
    for (const b of d.blocks) {
      if (b.type === 'main_strength') continue;
      for (const s of b.slots) {
        if (s.sets < 2) continue;
        const min = minSetRest(ex(s.exerciseId), b.type);
        assert.ok(s.restSec >= min, `${label} ${d.day} ${b.type} ${s.exerciseId}: ${s.restSec} s < ${min} s`);
      }
    }
};

test('descanso mínimo entre series según el tipo de ejercicio y la parte', () => {
  assert.equal(minSetRest(ex('air_squat'), 'warmup'), SET_REST_SEC.demanding); // 30 s
  assert.equal(minSetRest(ex('jumping_jacks'), 'warmup'), SET_REST_SEC.light); // 20 s
  assert.equal(minSetRest(ex('arm_circles'), 'warmup'), SET_REST_SEC.gentle); // 10 s
  assert.equal(minSetRest(ex('stretch_hamstring_supine'), 'cooldown'), SET_REST_SEC.gentle);
  assert.equal(minSetRest(ex('dead_hang'), 'cooldown'), SET_REST_SEC.gentle);
  // La Fuerza tiene sus propios mínimos por rol: esta regla no la toca.
  const strength = EXERCISES.find((e) => e.blockTypes.includes('main_strength'))!;
  assert.equal(minSetRest(strength, 'main_strength'), 0);
});

test('el mínimo solo sube descansos cortos: nunca baja uno mayor', () => {
  const slot = (exerciseId: string, restSec: number): ExerciseSlot => ({
    exerciseId,
    sets: 2,
    reps: 10,
    durationSec: null,
    weightKg: null,
    restSec,
    rationale: null,
  });
  assert.equal(withSetRest(slot('air_squat', 0), ex('air_squat'), 'warmup').restSec, 30);
  assert.equal(withSetRest(slot('dead_hang', 40), ex('dead_hang'), 'cooldown').restSec, 40);
  // Sin el ejercicio en el catálogo queda como estaba.
  assert.equal(setRestSec(slot('no_existe', 0), undefined, 'warmup'), 0);
});

test('el plan por reglas da descanso entre series en calentamiento, lesión y elongación', () => {
  for (const level of ['beginner', 'intermediate', 'advanced'] as const)
    for (const minutes of [20, 30, 45, 60, 90]) {
      const plan = generateWeekByRules(week(minutes), profile(level), EXERCISES, [], 7);
      assertRested(plan, `${level} ${minutes} min`);
    }
});

// Los descansos nuevos no alargan la sesión: calentamiento, lesión y elongación siguen cabiendo en
// sus minutos (si el descanso no cabe, va una serie menos). Solo pueden pasarse cuando ya no queda
// serie que quitar, y entonces no hay descanso entre series que sumar.
test('calentamiento, lesión y elongación siguen cabiendo en sus minutos', () => {
  const PART = { warmup: 'warmup', prehab: 'prehab', cooldown: 'cooldown' } as const;
  for (const level of ['beginner', 'intermediate', 'advanced'] as const)
    for (const minutes of [20, 30, 45, 60, 90]) {
      const w = week(minutes);
      const plan = generateWeekByRules(w, profile(level), EXERCISES, [], 7);
      for (const d of plan.days) {
        const cfg = w.days.find((c) => c.day === d.day)!;
        const budgets = partBudgets(cfg, level);
        for (const b of d.blocks) {
          if (b.type === 'main_strength') continue;
          const used = b.slots.reduce((t, s) => t + slotSeconds(s), 0);
          const budget = budgets[PART[b.type]] ?? 0;
          assert.ok(
            used <= budget || b.slots.every((s) => s.sets === 1),
            `${level} ${minutes} min ${d.day} ${b.type}: ${used} s > ${Math.round(budget)} s`,
          );
        }
      }
    }
});

test('la guardia corrige a la IA si sube una serie y deja el descanso en 0', () => {
  const w = week(45);
  const p = profile('intermediate');
  const rules = generateWeekByRules(w, p, EXERCISES, [], 7);
  // La IA pone «sentadilla sin peso, 2 × 10» al inicio del calentamiento del lunes, sin descanso.
  const squat: ExerciseSlot = {
    exerciseId: 'air_squat',
    sets: 2,
    reps: 10,
    durationSec: null,
    weightKg: null,
    restSec: 0,
    rationale: null,
  };
  const zeroRest = (slots: ExerciseSlot[]) => slots.map((s) => ({ ...s, restSec: 0 }));
  const ai: GeneratedWeekPlan = {
    ...rules,
    days: rules.days.map((d) =>
      d.day === 'mon'
        ? {
            ...d,
            blocks: d.blocks.map((b) =>
              b.type === 'warmup'
                ? { ...b, slots: [squat, ...zeroRest(b.slots.filter((s) => s.exerciseId !== 'air_squat'))] }
                : b.type === 'main_strength'
                  ? b
                  : { ...b, slots: zeroRest(b.slots) },
            ),
          }
        : d,
    ),
  };
  const guarded = guardAiPlan(ai, {
    days: w.days,
    profile: p,
    exercises: EXERCISES,
    history: [],
    lockedByDay: {},
    mainCandidates: [],
  });
  const warmup = guarded.days.find((d) => d.day === 'mon')!.blocks.find((b) => b.type === 'warmup')!;
  const kept = warmup.slots.find((s) => s.exerciseId === 'air_squat');
  assert.ok(kept, 'la sentadilla sigue en el calentamiento');
  assert.equal(kept.restSec, 30);
  assertRested(guarded, 'IA');
});

