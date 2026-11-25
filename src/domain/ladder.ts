import { usesKettlebell } from './experience';
import { type Exercise, painOf, type WorkoutSession } from './schema';

// Fila técnica de la kettlebell, acordada con Rodrigo el 25-11-2026: 15 pasos, de la bisagra al
// snatch. La persona la ve como un mapa y la app la sigue por dentro: no se salta pasos y lo ganado
// no se pierde. Cada paso se gana con 2 sesiones marcando «Pude mantener la técnica», sin dolor, y
// un tiempo mínimo que depende del riesgo del movimiento. El dolor baja un paso.
export type LadderStep = { name: string; ids: string[]; minWeeks: number };

export const LADDER: LadderStep[] = [
  {
    name: 'Bisagra de cadera',
    ids: ['hinge_wall_touch', 'hinge_hands_thighs', 'bar_hip_hinge', 'good_morning_bodyweight'],
    minWeeks: 0,
  },
  { name: 'Peso muerto', ids: ['kb_deadlift', 'kb_sumo_deadlift'], minWeeks: 0 },
  { name: 'Sentadilla goblet', ids: ['kb_goblet_squat'], minWeeks: 0 },
  { name: 'Remo a una mano', ids: ['kb_row'], minWeeks: 0 },
  { name: 'Hike pass', ids: ['kb_hike_pass'], minWeeks: 1 },
  { name: 'Swing con pausa', ids: ['kb_dead_stop_swing'], minWeeks: 1 },
  { name: 'Swing a dos manos', ids: ['kb_swing_2h'], minWeeks: 2 },
  // La pesa se sube al hombro con las dos manos: el clean llega recién en el paso 12.
  { name: 'Press militar', ids: ['kb_press', 'kb_half_kneeling_press'], minWeeks: 2 },
  { name: 'Peso muerto a una mano', ids: ['kb_suitcase_deadlift'], minWeeks: 2 },
  { name: 'Swing a una mano', ids: ['kb_swing_1h'], minWeeks: 2 },
  { name: 'Levantada turca', ids: ['kb_turkish_get_up'], minWeeks: 2 },
  // Desde aquí, los explosivos que llevan la pesa al hombro o sobre la cabeza con una mano: 4 semanas.
  { name: 'Clean', ids: ['kb_clean', 'kb_dead_clean'], minWeeks: 4 },
  { name: 'Clean y press', ids: ['kb_clean_press'], minWeeks: 4 },
  { name: 'Tirón alto', ids: ['kb_high_pull'], minWeeks: 4 },
  { name: 'Snatch', ids: ['kb_snatch'], minWeeks: 4 },
];
export const LADDER_LENGTH = LADDER.length;
// Los 4 primeros pasos son lentos y sin impulso: se practican juntos desde el inicio y se ganan
// dentro de la semana, uno tras otro.
export const BASE_STEPS = 4;
export const SWING_2H_STEP = 7;
// Con el swing a una mano ganado, el día de foco Potencia puede llevar un segundo balístico.
export const SWING_1H_STEP = 10;
const SESSIONS_TO_ADVANCE = 2;

const STEP_BY_ID = new Map(LADDER.flatMap((s, i) => s.ids.map((id) => [id, i + 1] as const)));
export const LADDER_IDS = new Set(STEP_BY_ID.keys());
export const ladderStepOf = (id: string) => STEP_BY_ID.get(id) ?? null;
export const clampStep = (step: number) => Math.min(LADDER_LENGTH, Math.max(1, Math.round(step)));

// Hasta dónde se planifica: lo ganado y, mientras está en la base, los 4 pasos base.
export const planStep = (step: number) => Math.max(step, BASE_STEPS);
export const unlockedLadderIds = (step: number) => LADDER.slice(0, planStep(step)).flatMap((s) => s.ids);
// Lo que la persona tiene que practicar esta semana para ganar su paso. En la base, los 3 con carga.
export const currentLadderIds = (step: number) =>
  step <= BASE_STEPS ? LADDER.slice(1, BASE_STEPS).flatMap((s) => s.ids) : (LADDER[step - 1]?.ids ?? []);

// Balísticos de potencia (bloque A). Los remates balísticos (serie gigante de swings, complejo) van aparte.
const FINISHER_BALLISTICS = ['kb_swing_finisher', 'kb_complex'];
const isPowerBallistic = (e: Exercise) =>
  e.restrictionFlags.includes('ballistic') && !FINISHER_BALLISTICS.includes(e.id);

// Los demás ejercicios con kettlebell se abren con el paso de su familia: la bisagra con el peso
// muerto, la sentadilla con la goblet, el tirón con el remo, y lo que va al hombro o sobre la cabeza
// con el press. Los balísticos que no están en la fila (push press, jerk, swing doble…) son
// variantes: se abren al completar la fila.
const FAMILY_STEP: Partial<Record<Exercise['movementPattern'], number>> = {
  hinge: 2,
  squat: 3,
  lunge: 3,
  pull_horizontal: 4,
  pull_vertical: 4,
  push_vertical: 8,
};
const PRESS_STEP = 8;
function familyStep(e: Exercise) {
  if (isPowerBallistic(e)) return LADDER_LENGTH;
  let step = FAMILY_STEP[e.movementPattern] ?? 0;
  const grip = e.kettlebellGuide?.grip;
  const shoulder = e.restrictionFlags.includes('overhead') || grip === 'rack' || grip === 'bottoms_up';
  const standing = e.movementPattern === 'carry' || e.movementPattern === 'squat' || e.movementPattern.startsWith('core_');
  if (shoulder && standing) step = Math.max(step, PRESS_STEP);
  return step;
}

// La dificultad máxima de los ejercicios con kettlebell sube con lo ganado en la fila, no solo con
// la experiencia declarada al empezar.
export const capForStep = (step: number) => (step >= 15 ? 5 : step >= 12 ? 4 : step >= SWING_2H_STEP ? 3 : 2);

// ¿Este ejercicio con kettlebell está abierto para la persona? Los de la fila, si el paso está ganado;
// los demás, por su familia, su dificultad y sus prerrequisitos (que a su vez deben estar abiertos).
// `declaredCap`: el tope según la experiencia declarada. `easier`: un punto menos en los días suaves.
export function ladderOpen(
  e: Exercise,
  step: number,
  declaredCap: number,
  byId: Map<string, Exercise>,
  easier = 0,
  seen: Set<string> = new Set(),
): boolean {
  const own = ladderStepOf(e.id);
  if (own != null) return own <= planStep(step);
  if (!usesKettlebell(e)) return true;
  if (seen.has(e.id)) return true;
  seen.add(e.id);
  const cap = Math.max(2, Math.max(declaredCap, capForStep(step)) - easier);
  if (e.complexityLevel > cap) return false;
  if (familyStep(e) > planStep(step)) return false;
  return (e.kettlebellGuide?.prerequisites ?? []).every((id) => {
    const p = byId.get(id);
    return !p || ladderOpen(p, step, declaredCap, byId, easier, seen);
  });
}

// ¿La sesión confirma el paso k? La bisagra (paso 1) va en el calentamiento, sin pregunta: basta con
// hacerla sin dolor. Los demás, con «Pude mantener la técnica».
function confirms(session: WorkoutSession, k: number) {
  const ids = LADDER[k - 1].ids;
  return k === 1
    ? session.sets.some((l) => ids.includes(l.exerciseId) && painOf(l) === 0)
    : session.sets.some((l) => ids.includes(l.exerciseId) && l.techniqueOk === true);
}

// El dolor baja un paso cuando aparece en el paso actual o en un movimiento con impulso ya ganado.
function painCounts(id: string, step: number) {
  const k = ladderStepOf(id);
  return k != null && k <= planStep(step) && (k === step || k > BASE_STEPS);
}

// La fila en palabras, para la guía que recibe la IA: qué paso tiene y qué debe practicar esta semana.
export function ladderGuide(step: number) {
  const now = LADDER[step - 1];
  const practice =
    step <= BASE_STEPS
      ? 'bisagra en el calentamiento, peso muerto en A, sentadilla goblet y remo a una mano en B'
      : `${now.name} (${now.ids.join(' o ')})`;
  return `Fila técnica de kettlebell: paso ${step} de ${LADDER_LENGTH} (${now.name}). Esta semana incluye en Fuerza, en al menos 2 días, ${practice}: así la persona puede confirmar su técnica. Todo día con trabajo de cadera parte con un ejercicio de bisagra en el calentamiento.`;
}

// Qué falta para el paso siguiente, en palabras para la persona (pantalla Progreso).
export function ladderNextNote(step: number) {
  if (step >= LADDER_LENGTH) return 'Llegaste al último paso: ya tienes disponibles todos los movimientos.';
  const next = LADDER[step].name;
  const { minWeeks } = LADDER[step - 1];
  const time =
    minWeeks === 0
      ? 'Se puede ganar en la misma semana'
      : `Además, necesitas al menos ${minWeeks === 1 ? '1 semana' : `${minWeeks} semanas`} de práctica en este paso`;
  const how =
    step === 1
      ? 'Se abre al hacer la bisagra del calentamiento en 2 sesiones, sin dolor.'
      : 'Se abre con 2 sesiones marcando «Pude mantener la técnica», sin dolor.';
  return `Siguiente: ${next}. ${how} ${time}.`;
}

const DAY_MS = 24 * 3600 * 1000;
// Un día de holgura: «una semana» se cumple aunque la sesión de hoy sea a otra hora que la de entonces.
const SLACK_MS = DAY_MS;

// Paso de la fila según la partida y lo logrado. `isDeload`: en la semana de descarga no se suma un
// paso nuevo (sí en la base, que no tiene tiempo mínimo). `now`: el tiempo mínimo también se cumple
// sin sesiones nuevas.
export function ladderStep(
  history: WorkoutSession[],
  start: number,
  opts: { now?: number; isDeload?: (t: number) => boolean } = {},
) {
  const isDeload = opts.isDeload ?? (() => false);
  let step = clampStep(start);
  const goods = new Array<number>(LADDER_LENGTH + 2).fill(0);
  let since: number | null = null;

  const tryAdvance = (t: number) => {
    while (step < LADDER_LENGTH && goods[step] >= SESSIONS_TO_ADVANCE) {
      const { minWeeks } = LADDER[step - 1];
      if (minWeeks > 0 && (since == null || t - since < minWeeks * 7 * DAY_MS - SLACK_MS || isDeload(t))) break;
      step++;
      since = t;
    }
  };

  const oldestFirst = [...history].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  for (const session of oldestFirst) {
    const t = Date.parse(session.finishedAt);
    if (since == null) since = t;
    // Si ya se cumplió el tiempo mínimo, el paso nuevo empieza antes de esta sesión: lo que haga hoy
    // cuenta para el paso nuevo.
    tryAdvance(t);
    if (session.sets.some((l) => painOf(l) > 0 && painCounts(l.exerciseId, step))) {
      step = Math.max(1, step - 1);
      for (let k = step; k < goods.length; k++) goods[k] = 0;
      since = t;
      continue;
    }
    // Día armado por la persona: no suma para avanzar (su dolor sí cuenta).
    if (session.chosenByUser) continue;
    for (let k = step; k <= LADDER_LENGTH; k++) {
      // Los pasos base se confirman en cualquier orden; los demás, solo el actual.
      if ((k === step || k <= BASE_STEPS) && confirms(session, k)) goods[k]++;
    }
    tryAdvance(t);
  }
  if (opts.now != null) tryAdvance(opts.now);
  return step;
}
