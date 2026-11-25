import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { cycleInfo } from '@/domain/cycle';
import { generateWeekByRules, MAX_COMPLEXITY } from '@/domain/generator';
import { LADDER, ladderOpen, ladderStep } from '@/domain/ladder';
import type { LocalProfile, WorkoutSession } from '@/domain/schema';
import { applyDayChoice, defaultWeekConfig, strengthDaysFrom, weekWithStrength } from '@/domain/week';

// Fila técnica de la kettlebell (25-11-2026): 15 pasos, de la bisagra al snatch.

const DAY = 864e5;
const START = Date.parse('2026-01-05T10:00:00.000Z'); // lunes

let n = 0;
// Una sesión el día indicado (desde START) con esos ejercicios; técnica confirmada salvo que se diga.
const session = (day: number, ids: string[], opts: { pain?: number; technique?: boolean } = {}): WorkoutSession => {
  const t = new Date(START + day * DAY).toISOString();
  return {
    id: `s${n++}`,
    day: 'mon',
    location: 'home',
    startedAt: t,
    finishedAt: t,
    completed: true,
    sets: ids.map((exerciseId) => ({
      exerciseId,
      setNo: 1,
      targetReps: 8,
      repsDone: 8,
      durationSec: null,
      weightKg: 12,
      rpe: 7,
      painFlag: (opts.pain ?? 0) >= 2,
      painLevel: (opts.pain ?? 0) as 0,
      techniqueOk: opts.technique ?? true,
    })),
  } as WorkoutSession;
};
const BASE = ['hinge_wall_touch', 'kb_deadlift', 'kb_goblet_squat', 'kb_row'];
const at = (day: number) => START + day * DAY;

test('la fila tiene 15 pasos y todos sus ejercicios existen', () => {
  assert.equal(LADDER.length, 15);
  assert.equal(LADDER[0].name, 'Bisagra de cadera');
  assert.equal(LADDER[4].name, 'Hike pass');
  assert.equal(LADDER[14].name, 'Snatch');
  for (const s of LADDER) for (const id of s.ids) assert.ok(EXERCISES_BY_ID.has(id), `${id} no existe`);
});

test('los 4 pasos base se ganan en la misma semana, con 2 sesiones', () => {
  assert.equal(ladderStep([session(0, BASE)], 1), 1);
  assert.equal(ladderStep([session(0, BASE), session(2, BASE)], 1), 5);
});

test('el hike pass pide 1 semana y el swing a dos manos, 2', () => {
  const base = [session(0, BASE), session(2, BASE)]; // paso 5 desde el día 2
  const hike = [...base, session(3, ['kb_hike_pass']), session(4, ['kb_hike_pass'])];
  assert.equal(ladderStep(hike, 1, { now: at(5) }), 5, 'confirmado, pero aún no pasa una semana');
  assert.equal(ladderStep(hike, 1, { now: at(9) }), 6, 'a la semana se abre el swing con pausa');
  const swing = [...hike, session(9, ['kb_dead_stop_swing']), session(11, ['kb_dead_stop_swing'])];
  const twoHands = [...swing, session(17, ['kb_swing_2h']), session(19, ['kb_swing_2h'])];
  assert.equal(ladderStep(twoHands, 1, { now: at(20) }), 7, 'el swing a dos manos pide 2 semanas');
  assert.equal(ladderStep(twoHands, 1, { now: at(31) }), 8);
});

test('solo cuenta el paso actual: hacer el swing en el paso del hike pass no adelanta nada', () => {
  const base = [session(0, BASE), session(2, BASE)];
  const early = [...base, session(3, ['kb_dead_stop_swing']), session(5, ['kb_dead_stop_swing'])];
  assert.equal(ladderStep(early, 1, { now: at(30) }), 5);
});

test('sin marcar la casilla no cuenta, pero tampoco borra lo confirmado', () => {
  const base = [session(0, BASE), session(2, BASE)];
  const mixed = [
    ...base,
    session(3, ['kb_hike_pass']),
    session(4, ['kb_hike_pass'], { technique: false }),
    session(6, ['kb_hike_pass']),
  ];
  assert.equal(ladderStep(mixed, 1, { now: at(10) }), 6);
});

test('el dolor baja un paso y el tiempo mínimo vuelve a contar', () => {
  // «Conozco lo básico» parte en el swing a dos manos (paso 7).
  const up = [session(0, ['kb_swing_2h']), session(3, ['kb_swing_2h'])];
  assert.equal(ladderStep(up, 7, { now: at(15) }), 8);
  const hurt = [...up, session(16, ['kb_swing_2h'], { pain: 2 })];
  assert.equal(ladderStep(hurt, 7, { now: at(17) }), 7);
});

test('en la semana de descarga no se suma un paso nuevo', () => {
  const up = [session(0, ['kb_swing_2h']), session(3, ['kb_swing_2h'])];
  const deload = (t: number) => t >= at(14) && t < at(21);
  assert.equal(ladderStep(up, 7, { now: at(15), isDeload: deload }), 7);
  assert.equal(ladderStep(up, 7, { now: at(21), isDeload: deload }), 8);
});

test('quien confirma todo, 3 veces por semana, llega al swing a dos manos en ~6 semanas y al snatch en ~7 meses', () => {
  const history: WorkoutSession[] = [];
  let swing2h: number | null = null;
  let snatch: number | null = null;
  for (let week = 0; week < 52 && snatch == null; week++) {
    for (const d of [0, 2, 4]) {
      const day = week * 7 + d;
      const step = ladderStep(history, 1, { now: at(day) });
      history.push(session(day, step <= 4 ? BASE : LADDER[step - 1].ids.slice(0, 1)));
      const after = ladderStep(history, 1, { now: at(day) });
      if (after >= 7 && swing2h == null) swing2h = week + 1;
      if (after >= 15 && snatch == null) snatch = week + 1;
    }
  }
  assert.ok(swing2h != null && swing2h <= 6, `swing a dos manos en la semana ${swing2h}`);
  assert.ok(snatch != null && snatch >= 24 && snatch <= 30, `snatch en la semana ${snatch}`);
});

test('lo abierto: los de la fila por paso; los demás por familia, prerrequisitos y dificultad', () => {
  const open = (id: string, step: number, cap = MAX_COMPLEXITY.beginner) =>
    ladderOpen(EXERCISES_BY_ID.get(id)!, step, cap, EXERCISES_BY_ID);
  // En la base se practican juntos el peso muerto, la goblet y el remo.
  assert.ok(open('kb_deadlift', 1) && open('kb_goblet_squat', 1) && open('kb_row', 1));
  assert.ok(!open('kb_hike_pass', 4));
  assert.ok(open('kb_hike_pass', 5));
  // Lo ganado no se pierde: en el paso 10 sigue disponible el swing a dos manos.
  assert.ok(open('kb_swing_2h', 10) && open('kb_swing_1h', 10));
  // Sin experiencia (tope 2), el swing a una mano (dificultad 3) se abre igual al ganarlo.
  assert.ok(open('kb_swing_1h', 10, MAX_COMPLEXITY.beginner));
  // El press y lo que va al hombro esperan al paso 8, aunque sean fáciles.
  assert.ok(!open('kb_press', 7) && open('kb_press', 8));
  assert.ok(!open('kb_front_squat', 7) && open('kb_front_squat', 8));
  assert.ok(!open('kb_rack_carry', 7) && open('kb_rack_carry', 8));
  // La levantada turca pide su paso, y el molino pide el press y su dificultad.
  assert.ok(!open('kb_turkish_get_up', 10) && open('kb_turkish_get_up', 11));
  assert.ok(!open('kb_windmill', 11) && open('kb_windmill', 12));
  // Las variantes balísticas fuera de la fila (push press, jerk) esperan al final.
  assert.ok(!open('kb_push_press', 14) && open('kb_push_press', 15));
});

const profile = (kettlebellExperience: LocalProfile['kettlebellExperience'], level: LocalProfile['level'] = 'advanced') =>
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
const planOf = (p: LocalProfile, history: WorkoutSession[] = [], days = 3) =>
  generateWeekByRules(week(days), p, EXERCISES, history, 7).days;
const idsIn = (days: ReturnType<typeof planOf>, type: string) =>
  days.flatMap((d) => d.blocks.filter((b) => b.type === type).flatMap((b) => b.slots.map((s) => s.exerciseId)));

test('el atleta que nunca usó la pesa: bisagra al calentar, peso muerto, goblet y remo; nada explosivo', () => {
  const days = planOf(profile('none'));
  const warm = idsIn(days, 'warmup');
  const main = idsIn(days, 'main_strength');
  for (const d of days) {
    const w = d.blocks.find((b) => b.type === 'warmup')?.slots ?? [];
    assert.ok(
      w.some((s) => EXERCISES_BY_ID.get(s.exerciseId)?.tags.includes('hinge_drill')),
      `${d.day}: falta la bisagra en el calentamiento (${warm.join(', ')})`,
    );
  }
  assert.ok(main.some((id) => LADDER[1].ids.includes(id)), 'falta el peso muerto');
  assert.ok(main.includes('kb_goblet_squat'), 'falta la sentadilla goblet');
  assert.ok(main.includes('kb_row'), 'falta el remo a una mano');
  for (const id of main) {
    const e = EXERCISES_BY_ID.get(id)!;
    assert.ok(!e.restrictionFlags.includes('ballistic'), `${id} es explosivo`);
    assert.notEqual(id, 'kb_press');
  }
});

// Días desde START hasta hace `ago` días (las semanas de preparación del ciclo son suaves, sin balísticos).
const daysAgo = (ago: number) => Math.floor((Date.now() - START) / DAY) - ago;

test('quien conoce lo básico hace swing a dos manos; nada de clean ni snatch', () => {
  const p = profile('basic', 'intermediate');
  assert.equal(cycleInfo([], p, week(3).days).stage, 7);
  // Ya entrenó hace 9 días: el ciclo empezó y la semana no es de preparación.
  const history = [session(daysAgo(9), ['kb_goblet_squat'], { technique: false })];
  const main = idsIn(planOf(p, history), 'main_strength');
  assert.ok(main.includes('kb_swing_2h'), `sin swing a dos manos: ${main.join(', ')}`);
  for (const id of ['kb_clean', 'kb_dead_clean', 'kb_snatch', 'kb_press', 'kb_turkish_get_up']) {
    assert.ok(!main.includes(id), `${id} todavía no está ganado`);
  }
});

test('el paso actual entra en la semana aunque no sea del bloque A (press militar)', () => {
  const p = profile('basic', 'intermediate');
  // Partió el lunes 5; confirmó el swing a dos manos 2 veces y ya pasaron 2 semanas: paso 8.
  const history = [session(daysAgo(16), ['kb_swing_2h']), session(daysAgo(14), ['kb_swing_2h'])];
  assert.equal(cycleInfo(history, p, week(3).days).stage, 8);
  const main = idsIn(planOf(p, history), 'main_strength');
  assert.ok(main.some((id) => LADDER[7].ids.includes(id)), `sin press: ${main.join(', ')}`);
  assert.ok(main.includes('kb_swing_2h'), 'lo ganado sigue: swing a dos manos en A');
});

test('el material didáctico tiene una ficha por paso y las 4 etapas en orden', async () => {
  const { LADDER_CARDS, LADDER_STAGES, ladderEarnText } = await import('@/content/ladderGuide');
  assert.equal(LADDER_CARDS.length, LADDER.length);
  for (const c of LADDER_CARDS) assert.ok(c.purpose && c.cue);
  assert.deepEqual(
    LADDER_STAGES.map((s) => s.from),
    [1, 5, 8, 12],
  );
  assert.match(ladderEarnText(1), /peso muerto/);
  assert.match(ladderEarnText(5), /1 semana/);
  assert.match(ladderEarnText(12), /4 semanas/);
  assert.match(ladderEarnText(15), /variantes/);
});
