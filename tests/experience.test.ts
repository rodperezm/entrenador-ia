import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { cycleInfo } from '@/domain/cycle';
import { kettlebellLevel, learningKettlebell, startStage, techniqueFirst, usesKettlebell } from '@/domain/experience';
import { generateWeekByRules, MAX_COMPLEXITY } from '@/domain/generator';
import type { LocalProfile } from '@/domain/schema';
import { applyDayChoice, defaultWeekConfig, strengthDaysFrom, weekWithStrength } from '@/domain/week';
import { buildAiRequest } from '@/features/planner/aiRequest';

const profile = (level: LocalProfile['level'], kettlebellExperience?: LocalProfile['kettlebellExperience']) =>
  ({
    displayName: 'P',
    level,
    kettlebellExperience,
    sex: 'male',
    birthDate: null,
    heightCm: null,
    equipment: ['kettlebell', 'mat', 'chair'],
    parkEquipment: [],
    kettlebellWeightsKg: [8, 12, 16, 20],
    kettlebellPairsKg: [],
    dumbbellWeightsKg: [],
    dumbbellPairsKg: [],
    conditions: [],
    excludedExerciseIds: [],
    disclaimerAcceptedAt: 'x',
    updatedAt: '2026-11-01T10:00:00.000Z',
  }) as unknown as LocalProfile;

const week = (days: number) => {
  const w = defaultWeekConfig();
  const choices = weekWithStrength(strengthDaysFrom(days, 'mon'));
  return { days: w.days.map((d) => ({ ...applyDayChoice(d, choices[d.day]), availableMinutes: 60 })) };
};
const mainOf = (p: LocalProfile, days = 3) =>
  generateWeekByRules(week(days), p, EXERCISES, [], 7).days.flatMap((d) =>
    d.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots),
  );

const athlete = profile('advanced', 'none'); // entrena fuerte, nunca usó kettlebell
const returning = profile('beginner', 'skilled'); // la domina, pero está partiendo de nuevo

test('sin experiencia declarada, todo sigue saliendo del nivel como antes', () => {
  for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
    const p = profile(level);
    assert.equal(kettlebellLevel(p), level);
    assert.equal(startStage(p), level === 'beginner' ? 1 : 2);
    assert.equal(learningKettlebell(p), level === 'beginner');
    assert.equal(techniqueFirst(p), level === 'beginner');
  }
});

test('el atleta que nunca usó kettlebell parte la pesa desde el principio', () => {
  assert.equal(startStage(athlete), 1);
  assert.equal(learningKettlebell(athlete), true);
  assert.equal(techniqueFirst(athlete), true);
  const cycle = cycleInfo([], athlete, week(3).days);
  assert.equal(cycle.stage, 1);
  assert.equal(cycle.phase, 'base'); // foco Técnica
});

test('el atleta sin kettlebell: mucho trabajo, pero ejercicios de kettlebell simples', () => {
  const slots = mainOf(athlete);
  assert.ok(slots.length > 0);
  for (const s of slots) {
    const e = EXERCISES_BY_ID.get(s.exerciseId)!;
    if (usesKettlebell(e)) {
      assert.ok(e.complexityLevel <= MAX_COMPLEXITY.beginner, `${e.id} es muy técnico para quien no ha usado la pesa`);
      assert.ok(!e.restrictionFlags.includes('ballistic'), `${e.id} es explosivo`);
    }
  }
  // La condición sigue mandando en lo corporal: recibe ejercicios sin pesa más difíciles que un principiante.
  const hardBodyweight = (p: LocalProfile) =>
    mainOf(p)
      .map((s) => EXERCISES_BY_ID.get(s.exerciseId)!)
      .filter((e) => !usesKettlebell(e) && e.complexityLevel > MAX_COMPLEXITY.beginner).length;
  assert.ok(hardBodyweight(athlete) > 0, 'el atleta debería recibir ejercicios corporales exigentes');
  assert.equal(hardBodyweight(profile('beginner', 'none')), 0);
});

test('quien domina la pesa pero está partiendo: pocas series, sin volver al peso muerto', () => {
  assert.equal(startStage(returning), 3);
  assert.equal(learningKettlebell(returning), false);
  assert.equal(techniqueFirst(returning), true); // por condición, la semana 3 no sube de pesa
  assert.equal(cycleInfo([], returning, week(3).days).stage, 3);
});

test('quien conoce lo básico queda como el intermedio de siempre', () => {
  const basic = profile('intermediate', 'basic');
  assert.equal(startStage(basic), 2);
  assert.equal(kettlebellLevel(basic), 'intermediate');
});

test('a la IA no se le ofrecen ejercicios de kettlebell más técnicos que la experiencia declarada', () => {
  const request = buildAiRequest(week(3), athlete, EXERCISES, [], null);
  assert.equal(request.profile.kettlebellExperience, 'none');
  const main = request.candidates.filter((c) => c.blocks.includes('main_strength'));
  assert.ok(main.length > 0);
  for (const c of main) {
    if (c.kettlebell && c.strengthRole !== 'A') {
      assert.ok(c.complexity <= MAX_COMPLEXITY.beginner, `${c.id} no debería ofrecerse`);
    }
  }
  // Sin experiencia declarada no se filtra nada nuevo.
  const legacy = buildAiRequest(week(3), profile('advanced'), EXERCISES, [], null);
  assert.ok(legacy.candidates.some((c) => c.kettlebell && c.blocks.includes('main_strength') && c.complexity > 2));
});
