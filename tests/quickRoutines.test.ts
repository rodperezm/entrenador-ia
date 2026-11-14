import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES_BY_ID } from '@/data/exercises.seed';
import { QUICK_ROUTINES, routineMinutes, routineSteps } from '@/domain/quickRoutines';

test('todas las rutinas rápidas usan ejercicios que existen en el catálogo', () => {
  for (const r of QUICK_ROUTINES) {
    const steps = routineSteps(r, EXERCISES_BY_ID);
    assert.equal(steps.length, r.exerciseIds.length, `falta un ejercicio en «${r.title}»`);
    assert.ok(steps.length >= 5, `«${r.title}» tiene menos de 5 ejercicios`);
  }
});

test('las rutinas rápidas no piden más equipo que una colchoneta', () => {
  for (const r of QUICK_ROUTINES)
    for (const s of routineSteps(r, EXERCISES_BY_ID))
      assert.deepEqual(
        s.exercise.equipment.required.filter((e) => e !== 'mat'),
        [],
        `${s.exercise.id} pide equipo`,
      );
});

test('las rutinas rápidas son cortas: entre 3 y 10 minutos', () => {
  for (const r of QUICK_ROUTINES) {
    const min = routineMinutes(routineSteps(r, EXERCISES_BY_ID));
    assert.ok(min >= 3 && min <= 10, `«${r.title}» dura ${min} min`);
  }
});

test('un ejercicio a un lado dura el doble y avisa «por lado»', () => {
  const steps = QUICK_ROUTINES.flatMap((r) => routineSteps(r, EXERCISES_BY_ID));
  for (const s of steps) assert.equal(s.label.includes('por lado'), s.sides === 2, s.exercise.id);
});
