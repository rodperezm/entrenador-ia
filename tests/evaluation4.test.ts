import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES } from '@/data/exercises.seed';
import type { CycleInfo } from '@/domain/cycle';
import { applyCycleWeek } from '@/domain/generator';
import type { LocalProfile } from '@/domain/schema';

// La escala técnica (antes A_STAGES) se prueba en tests/ladder.test.ts.

const squat = EXERCISES.find((e) => e.id === 'kb_goblet_squat')!;
const profileWith = (kettlebellWeightsKg: number[]) =>
  ({
    level: 'intermediate',
    equipment: ['kettlebell'],
    parkEquipment: [],
    kettlebellWeightsKg,
    kettlebellPairsKg: [],
    dumbbellWeightsKg: [],
    dumbbellPairsKg: [],
    conditions: [],
    excludedExerciseIds: [],
  }) as unknown as LocalProfile;
const week3 = { block: 1, week: 3, phase: 'strength', stage: 3, preparation: false } as unknown as CycleInfo;
const slot = { exerciseId: squat.id, role: 'B', sets: 4, reps: 10, durationSec: null, weightKg: 12, restSec: 120, rationale: null };

test('semana 3: de 12 a 16 kg no se sube de golpe; se exige con tempo y descanso', () => {
  const out = applyCycleWeek(slot as never, slot as never, squat, profileWith([12, 16]), week3, [], new Set());
  assert.equal(out.weightKg, 12);
  assert.equal(out.sets, 4);
  assert.ok(out.restSec < 120);
});

test('semana 3: un salto chico (de 12 a 14 kg) sí sube', () => {
  const out = applyCycleWeek(slot as never, slot as never, squat, profileWith([12, 14]), week3, [], new Set());
  assert.equal(out.weightKg, 14);
});

test('ciclo nuevo: tampoco se salta de 12 a 16 kg de golpe', () => {
  const week1 = { ...week3, block: 2, week: 1 } as unknown as CycleInfo;
  const big = applyCycleWeek(slot as never, slot as never, squat, profileWith([12, 16]), week1, [], new Set([squat.id]));
  assert.equal(big.weightKg, 12);
  const small = applyCycleWeek(slot as never, slot as never, squat, profileWith([12, 14]), week1, [], new Set([squat.id]));
  assert.equal(small.weightKg, 14);
});
