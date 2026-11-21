import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES } from '@/data/exercises.seed';
import { EVEN_TO_CLEAR, QUIET_TO_CLEAR, weakSideCue, weakSideOf } from '@/domain/balance';
import { feltTooMuch, progressSlot } from '@/domain/progression';
import type { ExerciseSlot, LocalProfile, SetLog, WorkoutSession } from '@/domain/schema';

// Desbalance entre lados: solo si la persona lo marca; mientras esté, la carga espera al lado débil.

const ex = EXERCISES.find((e) => e.laterality === 'unilateral' && e.blockTypes.includes('main_strength'))!;
const profile = {
  displayName: 'P',
  level: 'intermediate',
  equipment: ['kettlebell'],
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

const log = (weakSide?: SetLog['weakSide']): SetLog => ({
  exerciseId: ex.id,
  setNo: 1,
  targetReps: 8,
  repsDone: 12,
  durationSec: null,
  weightKg: 12,
  rpe: 6,
  painFlag: false,
  painLevel: 0,
  ...(weakSide ? { weakSide } : {}),
});
// De la más reciente a la más antigua, como el historial de la app.
const history = (...marks: (SetLog['weakSide'] | null)[]): WorkoutSession[] =>
  marks.map((m, i) => {
    const when = new Date(Date.UTC(2026, 10, 18 - i * 2)).toISOString();
    return {
      id: `s${i}`,
      day: 'mon',
      location: 'home',
      startedAt: when,
      finishedAt: when,
      completed: true,
      sets: [log(m ?? undefined)],
    };
  });

test('sin marcar nada no hay desbalance', () => {
  assert.equal(weakSideOf(ex.id, history(null, null)), null);
});

test('el último lado marcado queda vigente', () => {
  assert.equal(weakSideOf(ex.id, history('left')), 'left');
  assert.equal(weakSideOf(ex.id, history(null, 'right')), 'right');
});

test('se apaga con «Iguales» en sesiones seguidas o sin marcar varias veces', () => {
  assert.equal(weakSideOf(ex.id, history('even', 'left')), 'left');
  assert.equal(weakSideOf(ex.id, history(...Array(EVEN_TO_CLEAR).fill('even'), 'left')), null);
  assert.equal(weakSideOf(ex.id, history(...Array(QUIET_TO_CLEAR).fill(null), 'left')), null);
});

test('con un lado marcado la carga no sube y se sugiere empezar por el débil', () => {
  const slot: ExerciseSlot = {
    exerciseId: ex.id,
    sets: 2,
    reps: 8,
    durationSec: null,
    weightKg: 12,
    restSec: 60,
    rationale: null,
    role: 'B',
  };
  const held = progressSlot(slot, ex, profile, history('left'));
  assert.equal(held.weightKg, 12);
  assert.equal(held.reps, 8);
  assert.ok(held.rationale?.includes(weakSideCue('left')));
  assert.equal(feltTooMuch(ex.id, history('left')), true);
  // Con «Iguales» vuelve a progresar como siempre.
  assert.equal(feltTooMuch(ex.id, history('even')), false);
  assert.ok(!progressSlot(slot, ex, profile, history('even')).rationale?.includes('lado'));
});

test('«Con lo justo» mantiene la carga, sin quitar series', () => {
  const slot: ExerciseSlot = {
    exerciseId: ex.id,
    sets: 3,
    reps: 8,
    durationSec: null,
    weightKg: 12,
    restSec: 60,
    rationale: null,
    role: 'B',
  };
  const tight = history(null).map((s) => ({ ...s, feeling: 'tight' as const }));
  const held = progressSlot(slot, ex, profile, tight);
  assert.equal(held.weightKg, 12);
  assert.equal(held.sets, 3);
  assert.equal(held.rationale, 'Mantenemos la carga: la última vez terminaste con lo justo.');
  assert.equal(feltTooMuch(ex.id, tight), true);
});

test('el consejo nombra los dos lados', () => {
  assert.equal(weakSideCue('left'), 'Empieza por tu lado izquierdo y haz las mismas repeticiones con el derecho.');
});
