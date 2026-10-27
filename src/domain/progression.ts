import type { Exercise, ExerciseSlot, LocalProfile, SetLog, WorkoutSession } from './schema';

// Progresión a partir del historial: doble progresión (primero repeticiones,
// luego la siguiente kettlebell que el usuario tenga) y retroceso si hubo dolor.

const EASY_RPE = 8; // esfuerzo máximo para considerar que se puede progresar
const TIME_STEP_SEC = 5;

function lastLogs(exerciseId: string, history: WorkoutSession[]): SetLog[] {
  for (const s of history) {
    const logs = s.sets.filter((l) => l.exerciseId === exerciseId);
    if (logs.length) return logs;
  }
  return [];
}

const nextUp = (owned: number[], w: number) => owned.filter((x) => x > w).sort((a, b) => a - b)[0] ?? null;
const nextDown = (owned: number[], w: number) => owned.filter((x) => x < w).sort((a, b) => b - a)[0] ?? null;

export function progressSlot(
  slot: ExerciseSlot,
  e: Exercise,
  profile: LocalProfile,
  history: WorkoutSession[],
): ExerciseSlot {
  const logs = lastLogs(e.id, history);
  if (!logs.length) return slot;

  const owned = profile.kettlebellWeightsKg;
  const lastWeight = logs.find((l) => l.weightKg != null)?.weightKg ?? slot.weightKg;
  const rpes = logs.map((l) => l.rpe).filter((v): v is number => v != null);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
  const range = e.prescription.repRange;

  // Dolor: bajar la exigencia y avisarlo.
  if (logs.some((l) => l.painFlag)) {
    const lighter = lastWeight != null ? nextDown(owned, lastWeight) : null;
    return {
      ...slot,
      reps: range ? range.min : slot.reps,
      weightKg: lighter ?? (lastWeight != null ? Math.min(lastWeight, slot.weightKg ?? lastWeight) : slot.weightKg),
      rationale: 'Bajamos la exigencia: la última vez marcaste dolor.',
    };
  }

  const completed = logs.length >= slot.sets;
  const easy = avgRpe == null || avgRpe <= EASY_RPE;

  // Ejercicios por tiempo: +5 s si se completó con holgura.
  if (slot.durationSec != null) {
    const lastSec = Math.max(...logs.map((l) => l.durationSec ?? 0));
    if (completed && easy && lastSec >= slot.durationSec) {
      return {
        ...slot,
        durationSec: lastSec + TIME_STEP_SEC,
        rationale: `Subimos a ${lastSec + TIME_STEP_SEC} s: completaste ${lastSec} s.`,
      };
    }
    return { ...slot, durationSec: Math.max(slot.durationSec, lastSec || slot.durationSec) };
  }

  const lastTarget = logs[0].targetReps ?? slot.reps ?? 0;
  const hitTarget = logs.every((l) => (l.repsDone ?? 0) >= lastTarget);

  if (completed && hitTarget && easy && range) {
    if (lastTarget < range.max) {
      const reps = Math.min(range.max, lastTarget + 2);
      return {
        ...slot,
        reps,
        weightKg: lastWeight,
        rationale: `Subimos a ${reps} reps: completaste ${lastTarget} con esfuerzo controlado.`,
      };
    }
    const heavier = lastWeight != null ? nextUp(owned, lastWeight) : null;
    if (heavier) {
      return {
        ...slot,
        reps: range.min,
        weightKg: heavier,
        rationale: `Subimos a ${heavier} kg: llegaste al tope de ${range.max} reps.`,
      };
    }
    return {
      ...slot,
      reps: range.max,
      weightKg: lastWeight,
      rationale: 'Ya usas tu kettlebell más pesada: mantenemos el tope de reps.',
    };
  }

  if (avgRpe != null && avgRpe >= 9.5) {
    return {
      ...slot,
      reps: lastTarget || slot.reps,
      weightKg: lastWeight,
      rationale: 'Mantenemos: la última vez fue muy exigente.',
    };
  }
  return {
    ...slot,
    reps: lastTarget || slot.reps,
    weightKg: lastWeight,
    rationale: 'Repite la carga anterior hasta completarla.',
  };
}
