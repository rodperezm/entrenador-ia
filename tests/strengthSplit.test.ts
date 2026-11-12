import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { guardAiPlan } from '@/domain/aiGuard';
import { generateWeekByRules } from '@/domain/generator';
import type { DayOfWeek, LocalProfile, WeekConfig } from '@/domain/schema';
import { dayIntensity, isSplitWeek, offZone, weekFocus } from '@/domain/strength';
import { applyDayChoice, dayHashes, defaultWeekConfig } from '@/domain/week';

const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const weekOf = (n: number, minutes = 45): WeekConfig => {
  const w = defaultWeekConfig();
  return {
    days: w.days.map((d) => ({
      ...applyDayChoice(d, DAYS.indexOf(d.day) < n ? ['main'] : []),
      availableMinutes: minutes,
    })),
  };
};
const profile = (level: LocalProfile['level'] = 'intermediate') =>
  ({
    displayName: 'P',
    level,
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
  }) as unknown as LocalProfile;
const focusOf = (n: number) => Object.values(weekFocus(weekOf(n).days)).map((z) => z!.focus);
const mainOf = (plan: ReturnType<typeof generateWeekByRules>, day: DayOfWeek) =>
  plan.days
    .find((d) => d.day === day)!
    .blocks.filter((b) => b.type === 'main_strength')
    .flatMap((b) => b.slots.map((s) => EXERCISES_BY_ID.get(s.exerciseId)!));

test('1 a 3 días: cuerpo completo; 4 a 6: por zonas', () => {
  for (const n of [1, 2, 3]) assert.ok(focusOf(n).every((f) => f === 'full'));
  assert.deepEqual(focusOf(4), ['lower', 'upper', 'lower', 'upper']);
  assert.deepEqual(focusOf(5), ['lower', 'upper', 'power_core', 'lower', 'upper']);
  assert.deepEqual(focusOf(6), ['lower', 'upper', 'lower', 'upper', 'lower', 'upper']);
  assert.equal(isSplitWeek(weekOf(3).days), false);
  assert.equal(isSplitWeek(weekOf(4).days), true);
});

test('la misma zona nunca cae dos días de Fuerza seguidos', () => {
  for (const n of [4, 5, 6]) {
    const f = focusOf(n);
    f.forEach((zone, i) => i > 0 && assert.notEqual(zone, f[i - 1], `${n} días, posición ${i}`));
  }
});

test('un séptimo día de Fuerza no existe: queda suave, de potencia y core', () => {
  const w = weekOf(7);
  assert.equal(weekFocus(w.days).sun!.focus, 'power_core');
  assert.equal(dayIntensity(w.days, 'sun', 'advanced'), 'light');
});

test('exigencia en ola: la primera vuelta de cada zona es la fuerte', () => {
  const w = weekOf(6);
  assert.deepEqual(
    DAYS.slice(0, 6).map((d) => dayIntensity(w.days, d, 'advanced')),
    ['intense', 'intense', 'moderate', 'moderate', 'light', 'light'],
  );
  // El principiante sigue con 3 días fuertes como máximo.
  assert.equal(dayIntensity(weekOf(4).days, 'thu', 'beginner'), 'light');
});

test('las reglas respetan la zona de cada día (4, 5 y 6 días, tres niveles)', () => {
  for (const n of [4, 5, 6]) {
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      const w = weekOf(n);
      const plan = generateWeekByRules(w, profile(level), EXERCISES, [], 7);
      const zones = weekFocus(w.days);
      for (const d of plan.days) {
        const zone = zones[d.day]!.focus;
        const main = mainOf(plan, d.day);
        assert.ok(main.length >= 3, `${n} días ${level} ${d.day}: ${main.length} ejercicios`);
        for (const e of main) assert.equal(offZone(e, zone), false, `${n} días ${level} ${d.day}: ${e.id} en ${zone}`);
      }
    }
  }
});

test('tren superior: empuje y tirón el mismo día, y brazos en la semana', () => {
  const w = weekOf(4, 55);
  const plan = generateWeekByRules(w, profile(), EXERCISES, [], 7);
  const upper = [...mainOf(plan, 'tue'), ...mainOf(plan, 'thu')];
  for (const day of ['tue', 'thu'] as const) {
    const pats = mainOf(plan, day).map((e) => e.movementPattern);
    assert.ok(pats.some((p) => p.startsWith('push_')) && pats.some((p) => p.startsWith('pull_')), day);
  }
  const arms = upper.filter((e) => e.movementPattern === 'isolation_arm').flatMap((e) => e.anatomy.primary.map((m) => m.muscle));
  assert.ok(arms.includes('biceps') && arms.includes('triceps'), `brazos: ${arms.join(',')}`);
});

test('con 3 días nada cambia: sigue siendo cuerpo completo', () => {
  const plan = generateWeekByRules(weekOf(3), profile(), EXERCISES, [], 7);
  for (const d of plan.days) {
    const pats = mainOf(plan, d.day).map((e) => e.movementPattern);
    assert.ok(pats.some((p) => p.startsWith('push_')) && pats.some((p) => p.startsWith('pull_')));
    assert.ok(pats.some((p) => ['squat', 'lunge'].includes(p)));
    assert.ok(!mainOf(plan, d.day).some((e) => e.mechanics === 'isolation' && e.movementPattern !== 'isolation_arm'));
  }
});

test('la guardia corrige a la IA si mezcla zonas en un día', () => {
  const w = weekOf(4);
  const p = profile();
  const rules = generateWeekByRules(w, p, EXERCISES, [], 7);
  // La IA entrega el martes (tren superior) con la Fuerza del lunes (tren inferior).
  const monMain = rules.days.find((d) => d.day === 'mon')!.blocks.find((b) => b.type === 'main_strength')!;
  const ai = {
    ...rules,
    days: rules.days.map((d) =>
      d.day === 'tue' ? { ...d, blocks: d.blocks.map((b) => (b.type === 'main_strength' ? monMain : b)) } : d,
    ),
  };
  const guarded = guardAiPlan(ai, { days: w.days, profile: p, exercises: EXERCISES, history: [], lockedByDay: {}, mainCandidates: [] });
  const tue = guarded.days.find((d) => d.day === 'tue')!.blocks.find((b) => b.type === 'main_strength')!;
  for (const s of tue.slots) assert.equal(offZone(EXERCISES_BY_ID.get(s.exerciseId)!, 'upper'), false, s.exerciseId);
  assert.match(guarded.summary, /zonas/);
});

test('al pasar de 3 a 4 días, los días ya armados quedan desactualizados', () => {
  const three = dayHashes(weekOf(3), 'x');
  const four = dayHashes(weekOf(4), 'x');
  assert.notEqual(three.mon, four.mon);
  // Con 3 días la huella no cambia respecto de antes (no depende de la zona).
  assert.equal(dayHashes(weekOf(2), 'x').mon, three.mon);
});
