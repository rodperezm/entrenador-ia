import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES } from '@/data/exercises.seed';
import { explainDay } from '@/domain/explain';
import { generateDayByRules } from '@/domain/generator';
import type { LocalProfile, WeekConfig } from '@/domain/schema';
import { applyDayChoice, defaultWeekConfig } from '@/domain/week';

// «Día fuerte» solo se explica cuando la semana tiene días más livianos con qué compararlo.

const week: WeekConfig = {
  days: defaultWeekConfig().days.map((d) => applyDayChoice(d, d.day === 'mon' ? ['main'] : [])),
};
const cfg = week.days[0];
const profile = {
  displayName: 'P',
  level: 'intermediate',
  equipment: ['kettlebell', 'mat', 'chair'],
  parkEquipment: [],
  kettlebellWeightsKg: [8, 12, 16],
  kettlebellPairsKg: [],
  dumbbellWeightsKg: [],
  dumbbellPairsKg: [],
  conditions: [],
  excludedExerciseIds: [],
  updatedAt: 'x',
  disclaimerAcceptedAt: 'x',
} as unknown as LocalProfile;
const dayPlan = generateDayByRules(cfg, [], profile, EXERCISES, [], 7, [], week.days);
const lines = (intensity: 'intense' | 'moderate', weekMixed: boolean) =>
  explainDay({ dayPlan, cfg, profile, exercises: EXERCISES, intensity, weekMixed });

test('si todos los días de Fuerza son fuertes, no se dice «Día fuerte»', () => {
  assert.ok(!lines('intense', false).some((l) => l.startsWith('Día fuerte')));
});

test('si la semana alterna, se explica el día fuerte y el moderado', () => {
  assert.ok(lines('intense', true).includes('Día fuerte: hoy van todas las series que te tocan.'));
  assert.ok(lines('moderate', true).some((l) => l.startsWith('Día moderado: una serie menos')));
});
