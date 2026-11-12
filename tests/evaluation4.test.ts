import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES } from '@/data/exercises.seed';
import type { CycleInfo } from '@/domain/cycle';
import { applyCycleWeek } from '@/domain/generator';
import type { LocalProfile, WorkoutSession } from '@/domain/schema';
import { A_STAGES, techniqueStage, unlockedA } from '@/domain/strength';

const WEEK = 7 * 864e5;
const START = Date.parse('2026-01-05T10:00:00.000Z'); // lunes
const blockStarts = (n: number) => Array.from({ length: n }, (_, i) => START + i * 4 * WEEK);

// Dos sesiones buenas (técnica confirmada, sin dolor) del ejercicio en el bloque indicado.
const good = (block: number, exerciseId: string, painLevel = 0): WorkoutSession[] =>
  [1, 2].map((n) => {
    const t = new Date(START + block * 4 * WEEK + n * 864e5).toISOString();
    return {
      id: `b${block}-${n}-${exerciseId}`,
      day: 'mon',
      location: 'home',
      startedAt: t,
      finishedAt: t,
      completed: true,
      sets: [
        { exerciseId, setNo: 1, targetReps: 8, repsDone: 8, durationSec: null, weightKg: 12, rpe: 7, painFlag: painLevel >= 2, painLevel, techniqueOk: true },
      ],
    } as WorkoutSession;
  });

test('los balísticos libres se abren de a uno', () => {
  assert.deepEqual(unlockedA(3), ['kb_swing_2h']);
  assert.deepEqual(unlockedA(4), ['kb_swing_1h']);
  assert.ok(unlockedA(5).includes('kb_swing_1h') && unlockedA(5).includes('kb_clean'));
  assert.ok(!unlockedA(5).includes('kb_snatch'));
  assert.ok(unlockedA(6).includes('kb_snatch'));
  assert.equal(A_STAGES.length, 6);
});

test('cada etapa pide confirmar su propio ejercicio antes de abrir la siguiente', () => {
  // Intermedio parte en la etapa 2. Bloques 0, 1 y 2 buenos: llega al swing a una mano (4).
  const upTo4 = [...good(0, 'kb_dead_stop_swing'), ...good(1, 'kb_swing_2h')];
  assert.equal(techniqueStage(upTo4, 'intermediate', blockStarts(3)), 4);
  // Un bloque entero de swing a una mano abre el clean (5), no el snatch.
  const upTo5 = [...upTo4, ...good(2, 'kb_swing_1h')];
  assert.equal(techniqueStage(upTo5, 'intermediate', blockStarts(4)), 5);
  // En la etapa 5, seguir con swing a una mano no abre el snatch: hay que confirmar el clean.
  const stuck = [...upTo5, ...good(3, 'kb_swing_1h')];
  assert.equal(techniqueStage(stuck, 'intermediate', blockStarts(5)), 5);
  const upTo6 = [...upTo5, ...good(3, 'kb_clean')];
  assert.equal(techniqueStage(upTo6, 'intermediate', blockStarts(5)), 6);
});

test('el dolor en un balístico ya ganado hace retroceder una etapa', () => {
  const history = [
    ...good(0, 'kb_dead_stop_swing'),
    ...good(1, 'kb_swing_2h'),
    ...good(2, 'kb_swing_1h'),
    ...good(3, 'kb_swing_1h', 2).slice(0, 1),
  ];
  assert.equal(techniqueStage(history, 'intermediate', blockStarts(5)), 4);
});

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
