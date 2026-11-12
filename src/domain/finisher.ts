import { equipmentAt } from './catalog';
import type { CycleInfo } from './cycle';
import { filterExercisesForUser, weightsFor } from './filter';
import { cantDoIds, hadPain, pickWeight, strongPainIds } from './generator';
import {
  type DayPlan,
  type Exercise,
  type ExerciseSlot,
  type LocalProfile,
  painOf,
  type WorkoutSession,
} from './schema';
import type { TabataConfig } from './session';
import { isPerSide, workLabel } from './sides';
import { isZoneAccessory, A_STAGES, strengthRole } from './strength';
import { slotSeconds } from './timeBudget';
import { dayDate } from './week';

// Formas de cerrar la sesión: el bloque C normal, un circuito HIIT o un desafío AMRAP.
// Ninguna toca la fuerza de A y B. No se ofrecen a principiantes, en descarga, con dolor
// reciente ni con ejercicios muy técnicos. La IA sugiere; estas reglas ponen el límite.

const CIRCUIT_SIZE = 3;
const MAX_COMPLEXITY = 3;
const MIN_ROUNDS = 2;
const MAX_ROUNDS = 4;
const ROUND_REST_SEC = 45;
const PREP_SEC = 10;
const AMRAP_MAX_REPS = 10;
const AMRAP_MAX_SEC = 30;
const RECENT_PAIN_MS = 7 * 24 * 3600 * 1000;
const WORK_REST: Record<'intermediate' | 'advanced', [number, number]> = { intermediate: [30, 30], advanced: [40, 20] };
const AMRAP_MINUTES: Record<'intermediate' | 'advanced', number> = { intermediate: 7, advanced: 9 };

export type FinisherExercise = {
  key: string;
  exerciseId: string;
  name: string;
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
};
export type HiitOffer = { exercises: FinisherExercise[]; config: TabataConfig; minutes: number };
export type AmrapMark = { rounds: number; extraReps: number };
export type AmrapOffer = { exercises: FinisherExercise[]; minutes: number; previous: AmrapMark | null };
export type FinisherFormat = NonNullable<DayPlan['finisher']>['format'];
export type FinisherOffer = {
  hiit: HiitOffer;
  amrap: AmrapOffer;
  suggested: FinisherFormat;
  reason: string;
};

type OfferInput = {
  slots: { key: string; slot: ExerciseSlot }[]; // bloque C de hoy, aún sin hacer
  dayExerciseIds: string[];
  location: 'home' | 'park';
  profile: LocalProfile;
  exercises: Exercise[];
  history: WorkoutSession[];
  cycle: CycleInfo;
  advice?: DayPlan['finisher']; // consejo de la IA; sin él decide la semana del ciclo
  now?: number;
};

const REASON: Record<FinisherFormat, string> = {
  normal: 'Opcional: hoy puedes cerrar con tu bloque normal.',
  hiit: 'Hoy vienes sin dolor: cierra con intensidad sin tocar tu fuerza.',
  amrap: 'Rompe la rutina: desafíate a sumar más rondas que la última vez.',
};

export const finisherWork = (e: Pick<FinisherExercise, 'exerciseId' | 'reps' | 'seconds'>) =>
  workLabel(e.exerciseId, e.reps, e.seconds);

export const markLabel = ({ rounds, extraReps }: AmrapMark) =>
  `${rounds} ${rounds === 1 ? 'ronda' : 'rondas'}${extraReps ? ` + ${extraReps} reps` : ''}`;

export const markScore = (m: AmrapMark) => m.rounds * 1000 + m.extraReps;

const recentPain = (history: WorkoutSession[], now: number) =>
  history.some((s) => now - Date.parse(s.finishedAt) < RECENT_PAIN_MS && s.sets.some((l) => painOf(l) >= 2));

// Una kettlebell más liviana si la tiene: en circuito la técnica se cuida con menos peso.
function lighterWeight(e: Exercise, profile: LocalProfile, planned: number | null) {
  const weight = planned ?? pickWeight(e, profile);
  if (weight == null) return null;
  return (
    weightsFor(e, profile)
      .filter((w) => w < weight)
      .sort((a, b) => b - a)[0] ?? weight
  );
}

function finisherExercise(key: string, e: Exercise, weightKg: number | null): FinisherExercise {
  const { repRange, durationSec } = e.prescription;
  return {
    key,
    exerciseId: e.id,
    name: e.name.es,
    weightKg,
    reps: repRange ? Math.min(repRange.min, AMRAP_MAX_REPS) : null,
    seconds: repRange ? null : Math.min(durationSec ?? AMRAP_MAX_SEC, AMRAP_MAX_SEC),
  };
}

export function finisherOffer(input: OfferInput): FinisherOffer | null {
  const { slots, dayExerciseIds, location, profile, exercises, history, cycle, advice, now = Date.now() } = input;
  const level = profile.level;
  if (level === 'beginner' || cycle.preparation || cycle.week === 4 || !slots.length) return null;
  if (recentPain(history, now)) return null;

  const painful = [...strongPainIds(history, now), ...cantDoIds(history, now)];
  const fits = (e: Exercise) =>
    e.complexityLevel <= MAX_COMPLEXITY && !painful.includes(e.id) && !hadPain(e.id, history);
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const planned = slots.map(({ key, slot }) => ({ key, slot, e: byId.get(slot.exerciseId) }));
  if (planned.some(({ e }) => !e || !fits(e))) return null;

  const pool = filterExercisesForUser(
    exercises,
    { ...profile, equipment: equipmentAt(location, profile) },
    'main_strength',
  ).filter(
    (e) =>
      strengthRole(e) === 'C' &&
      // Los accesorios de zona (aislados lentos) no van en un circuito.
      !isZoneAccessory(e) &&
      fits(e) &&
      !isPerSide(e.id) &&
      !dayExerciseIds.includes(e.id) &&
      // Los balísticos en circuito, solo con el swing ya dominado.
      (!e.restrictionFlags.includes('ballistic') || A_STAGES[cycle.stage - 1]?.includes('kb_swing_1h')),
  );
  const circuit = planned.map(({ key, slot, e }) => ({
    ...finisherExercise(key, e!, lighterWeight(e!, profile, slot.weightKg)),
    pattern: e!.movementPattern,
  }));
  // Completa el circuito variando el patrón; a igual patrón, el ejercicio más simple.
  // Es determinista: con los mismos fijos del ciclo, el desafío se repite y se puede comparar.
  const ordered = [...pool].sort((a, b) => a.complexityLevel - b.complexityLevel || a.id.localeCompare(b.id));
  while (circuit.length < CIRCUIT_SIZE) {
    const next =
      ordered.find((e) => !circuit.some((c) => c.pattern === e.movementPattern)) ??
      ordered.find((e) => !circuit.some((c) => c.exerciseId === e.id));
    if (!next) break;
    circuit.push({
      ...finisherExercise(`finisher-${next.id}`, next, lighterWeight(next, profile, null)),
      pattern: next.movementPattern,
    });
  }
  if (circuit.length < 2) return null;
  const list = circuit.map(({ pattern: _pattern, ...exercise }) => exercise);

  const [workSec, restSec] = WORK_REST[level];
  const lap = list.length * (workSec + restSec);
  const target = slots.reduce((t, s) => t + slotSeconds(s.slot), 0);
  const rounds = Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(target / lap)));
  const hiit: HiitOffer = {
    exercises: list,
    config: {
      rounds,
      exercises: list.length,
      workSec,
      restSec,
      roundRestSec: ROUND_REST_SEC,
      prepSec: PREP_SEC,
      coolSec: 0,
    },
    minutes: Math.ceil((PREP_SEC + rounds * lap + (rounds - 1) * ROUND_REST_SEC) / 60),
  };

  const minutes = AMRAP_MINUTES[level];
  const ids = list.map((e) => e.exerciseId).join(',');
  const previous =
    history.find((s) => s.amrap?.minutes === minutes && s.amrap.exerciseIds.join(',') === ids)?.amrap ?? null;
  const monday = dayDate('mon', new Date(now)).getTime();
  const amrapThisWeek = history.some((s) => s.amrap && Date.parse(s.finishedAt) >= monday);

  // Semana de máxima intensidad: la protagonista es la fuerza. AMRAP, máximo una vez por semana.
  const byRules: FinisherFormat = cycle.week === 2 && !amrapThisWeek ? 'amrap' : 'hiit';
  const wanted = advice?.format ?? byRules;
  const suggested = cycle.week === 3 || (wanted === 'amrap' && amrapThisWeek) ? 'normal' : wanted;

  return {
    hiit,
    amrap: {
      exercises: list,
      minutes,
      previous: previous && { rounds: previous.rounds, extraReps: previous.extraReps },
    },
    suggested,
    reason: (suggested === wanted && advice?.reason) || REASON[suggested],
  };
}
