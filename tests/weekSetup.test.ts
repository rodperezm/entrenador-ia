import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES } from '@/data/exercises.seed';
import { MEDICAL_CONDITIONS } from '@/domain/catalog';
import { generateWeekByRules } from '@/domain/generator';
import type { DayOfWeek, LocalProfile, WeekConfig } from '@/domain/schema';
import {
  applyDayChoice,
  CARE_DAY,
  dayKindOf,
  defaultWeekConfig,
  maxStrengthDays,
  minutesRange,
  STRENGTH_DAY,
  strengthDaysFrom,
  strengthDaysFull,
  toggleDayType,
  weekWithStrength,
} from '@/domain/week';

const ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

test('los días de Fuerza se reparten desde el día de inicio, con descansos', () => {
  assert.deepEqual(strengthDaysFrom(3, 'mon'), ['mon', 'wed', 'fri']);
  assert.deepEqual(strengthDaysFrom(2, 'thu'), ['thu', 'sun']);
  assert.deepEqual(strengthDaysFrom(4, 'sat'), ['sat', 'sun', 'tue', 'wed']);
  // Siempre queda al menos un día libre, y nunca menos de 2 ni más de 6 días.
  for (const start of ORDER) {
    for (let n = 0; n <= 8; n++) {
      const days = strengthDaysFrom(n, start);
      assert.equal(new Set(days).size, days.length);
      assert.ok(days.length >= 2 && days.length <= 6);
      assert.equal(days[0], start);
    }
  }
});

test('con 2 y 3 días nunca hay dos días de Fuerza seguidos', () => {
  for (const start of ORDER) {
    for (const n of [2, 3]) {
      const idx = strengthDaysFrom(n, start).map((d) => ORDER.indexOf(d));
      for (const i of idx) assert.ok(!idx.includes((i + 1) % 7), `${n} días desde ${start}`);
    }
  }
});

test('el principiante tiene 3 días de Fuerza como máximo; los demás, 6', () => {
  assert.equal(maxStrengthDays('beginner'), 3);
  assert.equal(maxStrengthDays('intermediate'), 6);
  const three = weekWithStrength(strengthDaysFrom(3, 'mon'));
  assert.equal(strengthDaysFull(three, 'tue', 'beginner'), true);
  assert.equal(strengthDaysFull(three, 'tue', 'advanced'), false);
  assert.equal(strengthDaysFull(three, 'mon', 'beginner'), false); // editar uno de sus 3 días sí se puede
});

test('Fuerza y Lesión van en días distintos: al elegir una, sale la otra', () => {
  assert.equal(dayKindOf(toggleDayType(CARE_DAY, 'main')), 'strength');
  assert.ok(!toggleDayType(CARE_DAY, 'main').includes('prehab'));
  assert.equal(dayKindOf(toggleDayType(STRENGTH_DAY, 'prehab')), 'care');
  assert.ok(!toggleDayType(STRENGTH_DAY, 'prehab').includes('main'));
  // El día de Lesión lleva calentamiento y elongación.
  assert.deepEqual(toggleDayType(STRENGTH_DAY, 'prehab'), ['warmup', 'prehab', 'cooldown']);
});

test('minutos: Fuerza de 30 a 90; días de apoyo de 10 a 40', () => {
  assert.deepEqual([minutesRange(STRENGTH_DAY).min, minutesRange(STRENGTH_DAY).max], [30, 90]);
  assert.deepEqual([minutesRange(CARE_DAY).min, minutesRange(CARE_DAY).max], [10, 40]);
  assert.deepEqual([minutesRange(['cooldown']).min, minutesRange(['cooldown']).max], [10, 40]);
});

test('con una lesión, el calentamiento del día de Fuerza parte activando esa zona', () => {
  const knee = MEDICAL_CONDITIONS.find((m) => m.id === 'patellofemoral_pain')!;
  const profile = {
    displayName: 'P',
    level: 'intermediate',
    equipment: ['kettlebell', 'mat', 'chair'],
    parkEquipment: [],
    kettlebellWeightsKg: [8, 12, 16],
    kettlebellPairsKg: [],
    dumbbellWeightsKg: [],
    dumbbellPairsKg: [],
    conditions: [{ conditionId: knee.id, activeFlags: knee.suggestedFlags, notes: null }],
    excludedExerciseIds: [],
    updatedAt: 'x',
    disclaimerAcceptedAt: 'x',
  } as unknown as LocalProfile;
  const choices = weekWithStrength(strengthDaysFrom(3, 'mon'));
  const week: WeekConfig = {
    days: defaultWeekConfig().days.map((d) => ({ ...applyDayChoice(d, choices[d.day]), availableMinutes: 45 })),
  };
  const plan = generateWeekByRules(week, profile, EXERCISES, [], 5);
  for (const d of plan.days) {
    assert.ok(!d.blocks.some((b) => b.type === 'prehab'), `${d.day} no lleva bloque de Lesión`);
    const first = d.blocks.find((b) => b.type === 'warmup')!.slots[0];
    assert.ok(knee.prehabExerciseIds.includes(first.exerciseId), `${d.day}: ${first.exerciseId}`);
  }
});
