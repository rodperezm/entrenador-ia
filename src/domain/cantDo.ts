import { equipmentAt } from './catalog';
import { trainingStamp } from '@/domain/profileStamp';
import { filterExercisesForUser } from './filter';
import { cantDoIds, prescribe } from './generator';
import type {
  CantDoReason,
  DayPlan,
  Exercise,
  ExerciseSlot,
  LocalProfile,
  PlannedBlock,
  WorkoutSession,
} from './schema';
import { MIN_REST_SEC, strengthRole } from './strength';

// «No puedo hacerlo»: la persona no sabe hacer el ejercicio, no se siente segura o no tiene
// dónde hacerlo bien. Manda lo que dice: se cambia por uno parecido y más simple, y ese
// ejercicio no se vuelve a proponer durante un ciclo (ver cantDoIds), hasta que esté lista.

export const CANT_DO_OPTIONS: { id: CantDoReason; label: string }[] = [
  { id: 'no_place', label: 'El lugar no me lo permite' },
  { id: 'dont_know', label: 'No conozco el ejercicio' },
  { id: 'too_hard', label: 'Está muy difícil' },
  { id: 'not_safe', label: 'No me siento seguro' },
];

const sharedGroups = (a: Exercise, b: Exercise) => a.muscleGroups.filter((g) => b.muscleGroups.includes(g)).length;
// En Fuerza el cambio se queda en la familia del patrón (piernas, empuje, tirón, acarreo o core).
const family = (e: Exercise) =>
  ['squat', 'lunge', 'hinge'].includes(e.movementPattern) ? 'legs' : e.movementPattern.split('_')[0];

// Lo más parecido y más simple que se puede hacer ahí: primero su paso previo en la progresión
// (hip thrust → puente de glúteos), luego el mismo patrón y los mismos músculos, el más simple.
export function easierAlternative(
  original: Exercise,
  block: PlannedBlock['type'],
  ctx: {
    profile: LocalProfile;
    exercises: Exercise[];
    location: DayPlan['location'];
    used: Set<string>;
    history: WorkoutSession[];
  },
): Exercise | null {
  const avoid = new Set([...ctx.used, ...cantDoIds(ctx.history, Date.now(), trainingStamp(ctx.profile)), original.id]);
  const pool = filterExercisesForUser(
    ctx.exercises,
    { ...ctx.profile, equipment: equipmentAt(ctx.location, ctx.profile) },
    block,
  ).filter(
    (e) =>
      !avoid.has(e.id) &&
      e.complexityLevel <= original.complexityLevel &&
      // En Fuerza puede entrar uno sin rol propio (puente de glúteos): toma el del original.
      (block !== 'main_strength' || family(e) === family(original)),
  );
  // Orden: su paso previo; el mismo movimiento más simple; el mismo movimiento; otro más simple.
  const rank = (e: Exercise) => {
    const same = e.movementPattern === original.movementPattern;
    const simpler = e.complexityLevel < original.complexityLevel;
    if (original.progression.previous.includes(e.id)) return 0;
    if (same && simpler) return 1;
    if (same) return 2;
    return simpler ? 3 : 4;
  };
  pool.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      sharedGroups(b, original) - sharedGroups(a, original) ||
      a.complexityLevel - b.complexityLevel ||
      a.id.localeCompare(b.id),
  );
  return pool[0] ?? null;
}

// La serie del reemplazo: la dosis del ejercicio nuevo, con las series que faltaban.
export function replacementSlot(
  alt: Exercise,
  original: ExerciseSlot,
  setsLeft: number,
  block: PlannedBlock['type'],
  profile: LocalProfile,
): ExerciseSlot {
  const base = prescribe(alt, profile, 'Cambio por uno más simple: lo marcaste como «No puedo hacerlo».');
  const role = block === 'main_strength' ? (strengthRole(alt) ?? original.role ?? 'C') : undefined;
  return {
    ...base,
    sets: Math.max(1, setsLeft),
    ...(role ? { role, restSec: Math.max(base.restSec, MIN_REST_SEC[role]) } : {}),
  };
}
