import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorkoutSession } from '@/domain/schema';
import { canResume, parseDraft, sessionFromDraft, sessionIdOf, type WorkoutDraft } from '@/domain/workoutDraft';

const T0 = Date.parse('2026-11-09T10:00:00.000Z');
const log = (itemKey: string, setNo: number, extra: object = {}) => ({
  itemKey,
  exerciseId: 'kb_goblet_squat',
  setNo,
  targetReps: 10,
  repsDone: 10,
  durationSec: null,
  weightKg: 16,
  rpe: null,
  painFlag: false,
  painLevel: null,
  ...extra,
});
const draft = (extra: Partial<WorkoutDraft> = {}): WorkoutDraft => ({
  v: 1,
  day: 'mon',
  location: 'home',
  startedAt: T0,
  savedAt: T0 + 20 * 60000,
  planGeneratedAt: '2026-11-09T09:00:00.000Z',
  totalSets: 12,
  logs: [log('main_strength-0', 1), log('main_strength-0', 2)],
  idx: 0,
  feedback: false,
  checkIn: { arrival: 'normal' },
  overrides: {},
  skipped: [],
  itemPain: {},
  painSides: {},
  replacements: {},
  modifiedKeys: [],
  modifiedIds: [],
  markTimes: [],
  closingDismissed: false,
  ...extra,
});

test('lo guardado se lee de vuelta igual; lo dañado se ignora sin fallar', () => {
  const d = draft();
  assert.deepEqual(parseDraft(JSON.stringify(d)), d);
  assert.equal(parseDraft('{roto'), null);
  assert.equal(parseDraft(JSON.stringify({ ...d, day: 'lunes' })), null);
  assert.equal(parseDraft(null), null);
});

test('se retoma solo el mismo día, con la misma rutina y a tiempo', () => {
  const d = draft();
  const ctx = { day: 'mon', planGeneratedAt: d.planGeneratedAt, now: d.savedAt + 3600e3 };
  assert.equal(canResume(d, ctx), true);
  assert.equal(canResume(d, { ...ctx, day: 'tue' }), false);
  assert.equal(canResume(d, { ...ctx, planGeneratedAt: '2026-11-10T09:00:00.000Z' }), false);
  assert.equal(canResume(d, { ...ctx, now: d.savedAt + 19 * 3600e3 }), false);
});

test('lo hecho se guarda como sesión válida, sin terminar, con el mismo id que tendría al terminar', () => {
  const s = sessionFromDraft(draft());
  assert.equal(WorkoutSession.safeParse(s).success, true);
  assert.equal(s.id, sessionIdOf(T0));
  assert.deepEqual([s.completed, s.sets.length], [false, 2]);
  assert.equal(s.finishedAt, new Date(T0 + 20 * 60000).toISOString());
  assert.equal('itemKey' in s.sets[0], false);
});

test('el dolor marcado en el ejercicio queda en sus series', () => {
  const s = sessionFromDraft(draft({ itemPain: { 'main_strength-0': 2 }, painSides: { 'main_strength-0': 'left' } }));
  assert.deepEqual(
    s.sets.map((l) => [l.painLevel, l.painFlag, l.painSide]),
    [
      [2, true, 'left'],
      [2, true, 'left'],
    ],
  );
});
