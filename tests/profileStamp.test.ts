import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextTrainingStamp, trainingStamp } from '@/domain/profileStamp';
import type { LocalProfile } from '@/domain/schema';
import { dayHashes, defaultWeekConfig, staleDays } from '@/domain/week';

const OLD = '2026-11-01T10:00:00.000Z';
const NEW = '2026-11-12T22:00:00.000Z';
const base = {
  displayName: 'Prueba',
  level: 'intermediate',
  equipment: ['kettlebell', 'mat'],
  parkEquipment: [],
  kettlebellWeightsKg: [12, 16],
  kettlebellPairsKg: [],
  dumbbellWeightsKg: [],
  dumbbellPairsKg: [],
  conditions: [],
  excludedExerciseIds: [],
  sex: 'male',
  birthDate: '1980-05-10',
  heightCm: 175,
  disclaimerAcceptedAt: OLD,
  updatedAt: OLD,
} as unknown as LocalProfile;
// Como lo guarda la app: fecha general nueva y la de entrenamiento que corresponda.
const saved = (prev: LocalProfile, patch: Partial<LocalProfile>) => {
  const dated = { ...prev, ...patch, updatedAt: NEW };
  return { ...dated, trainingUpdatedAt: nextTrainingStamp(prev, dated) };
};

test('responder las alertas médicas, o cambiar el nombre, no marca los días como cambiados', () => {
  const week = defaultWeekConfig();
  const plan = { configHash: 'x', dayHashes: dayHashes(week, trainingStamp(base)), days: week.days };
  for (const patch of [{ healthAlerts: [] }, { displayName: 'Otro nombre' }, { heightCm: 180 }] as Partial<LocalProfile>[]) {
    const after = saved(base, patch);
    assert.equal(after.updatedAt, NEW); // el respaldo sí ve que el perfil cambió
    assert.equal(trainingStamp(after), OLD);
    assert.equal(staleDays(plan, week, trainingStamp(after)).size, 0);
  }
});

test('cambiar nivel, pesas, equipamiento o lesiones sí pide rehacer la rutina', () => {
  const week = defaultWeekConfig();
  const plan = { configHash: 'x', dayHashes: dayHashes(week, trainingStamp(base)), days: week.days };
  const patches = [
    { level: 'advanced' },
    { kettlebellWeightsKg: [12, 16, 20] },
    { equipment: ['kettlebell', 'mat', 'chair'] },
    { excludedExerciseIds: ['kb_swing_2h'] },
  ] as unknown as Partial<LocalProfile>[];
  for (const patch of patches) {
    const after = saved(base, patch);
    assert.equal(trainingStamp(after), NEW);
    assert.ok(staleDays(plan, week, trainingStamp(after)).size > 0);
  }
});

test('la fecha de entrenamiento se conserva a través de varios cambios menores', () => {
  const once = saved(base, { healthAlerts: [] });
  const twice = { ...once, displayName: 'Tercero', updatedAt: '2026-11-13T09:00:00.000Z' };
  assert.equal(nextTrainingStamp(once, twice), OLD);
});
