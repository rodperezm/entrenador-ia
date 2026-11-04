import { effortKind } from './effort';
import { weightsFor } from './filter';
import { MAIN_MAX_SETS } from './timeBudget';
import {
  type Exercise,
  type ExerciseSlot,
  type LocalProfile,
  painOf,
  type SetLog,
  type WorkoutSession,
} from './schema';

// Progresión a partir del historial: doble progresión (primero repeticiones,
// luego la siguiente kettlebell que el usuario tenga; si el salto pasa del 20 %, antes
// una serie más y tempo lento). Con molestia leve se mantiene
// la carga; con dolor moderado o fuerte se baja.

const EASY_RPE = 8; // esfuerzo máximo para considerar que se puede progresar
const WANTED_MORE_RPE = 9; // con «Me quedé con ganas», hasta 1 repetición en reserva
const TOO_HARD_RPE = 9.5;
const TIME_STEP_SEC = 5;
const BIG_JUMP = 1.2; // subir más de un 20 % de peso de una vez pide peldaños antes

function lastSessionOf(exerciseId: string, history: WorkoutSession[]) {
  for (const s of history) {
    // En HIIT y AMRAP cambian el peso y la fatiga: solo importa si hubo dolor.
    const logs = s.sets.filter((l) => l.exerciseId === exerciseId && (!l.format || painOf(l) > 0));
    if (logs.length) return { session: s, logs };
  }
  return null;
}

const lastLogs = (exerciseId: string, history: WorkoutSession[]): SetLog[] =>
  lastSessionOf(exerciseId, history)?.logs ?? [];

// Sesiones seguidas, desde la más reciente, al tope de repeticiones con el mismo peso y esfuerzo controlado.
function topStreak(exerciseId: string, history: WorkoutSession[], weight: number | null, maxReps: number) {
  let streak = 0;
  for (const s of history) {
    const logs = s.sets.filter((l) => l.exerciseId === exerciseId && !l.format);
    if (!logs.length) continue;
    const rpes = logs.map((l) => l.rpe).filter((v): v is number => v != null);
    const easy = !rpes.length || rpes.reduce((a, b) => a + b, 0) / rpes.length <= EASY_RPE;
    const atTop = logs.every((l) => (l.repsDone ?? 0) >= maxReps) && (logs[0].weightKg ?? null) === weight;
    if (!atTop || !easy) break;
    streak++;
  }
  return streak;
}

// La última vez que hizo el ejercicio dijo «Fue mucho»: no se exige más.
export const feltTooMuch = (exerciseId: string, history: WorkoutSession[]) =>
  lastSessionOf(exerciseId, history)?.session.feeling === 'too_much';

// «Fue mucho» en las dos últimas sesiones: se baja una serie.
const tooMuchTwice = (history: WorkoutSession[]) =>
  history.length >= 2 && history.slice(0, 2).every((s) => s.feeling === 'too_much');

// Quedó muy pesado: sin repeticiones de reserva, sin completarlas o bajando el peso planificado.
export function wasTooHard(exerciseId: string, history: WorkoutSession[]) {
  const logs = lastLogs(exerciseId, history);
  const rpes = logs.map((l) => l.rpe).filter((v): v is number => v != null);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 0;
  return (
    avgRpe >= TOO_HARD_RPE ||
    logs.some((l) => l.targetReps != null && l.repsDone != null && l.repsDone < l.targetReps) ||
    logs.some((l) => l.plannedWeightKg != null && l.weightKg != null && l.weightKg < l.plannedWeightKg)
  );
}

const nextUp = (owned: number[], w: number) => owned.filter((x) => x > w).sort((a, b) => a - b)[0] ?? null;
const nextDown = (owned: number[], w: number) => owned.filter((x) => x < w).sort((a, b) => b - a)[0] ?? null;

export function progressSlot(
  slot: ExerciseSlot,
  e: Exercise,
  profile: LocalProfile,
  history: WorkoutSession[],
): ExerciseSlot {
  const last = lastSessionOf(e.id, history);
  if (!last) return slot;
  const { logs } = last;
  const feeling = last.session.feeling;

  const owned = weightsFor(e, profile);
  const lastWeight = logs.find((l) => l.weightKg != null)?.weightKg ?? slot.weightKg;
  const rpes = logs.map((l) => l.rpe).filter((v): v is number => v != null);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
  const range = e.prescription.repRange;

  const pain = Math.max(...logs.map(painOf));

  // Dolor moderado o fuerte: bajar la exigencia y avisarlo. (Con dolor fuerte el
  // generador además prefiere cambiar el ejercicio; si vuelve, llega aquí más suave.)
  if (pain >= 2) {
    const lighter = lastWeight != null ? nextDown(owned, lastWeight) : null;
    return {
      ...slot,
      reps: range ? range.min : slot.reps,
      durationSec: slot.durationSec != null ? Math.max(10, slot.durationSec - TIME_STEP_SEC) : null,
      weightKg: lighter ?? (lastWeight != null ? Math.min(lastWeight, slot.weightKg ?? lastWeight) : slot.weightKg),
      rationale:
        pain === 3
          ? 'Más suave: la última vez marcaste dolor fuerte. Si se repite, consulta a un profesional.'
          : 'Bajamos la exigencia: la última vez marcaste dolor moderado.',
    };
  }

  // Molestia leve: no subir, repetir la misma carga y vigilar.
  if (pain === 1) {
    return {
      ...slot,
      reps: slot.durationSec != null ? slot.reps : (logs[0].targetReps ?? slot.reps),
      weightKg: lastWeight,
      rationale: 'Mantenemos la carga: la última vez marcaste una molestia leve.',
    };
  }

  // Calentamiento, movilidad, equilibrio y elongación no progresan en carga: se mantienen.
  if (effortKind(e) === 'none') return slot;

  // «Fue mucho»: la próxima vez no sube nada; dos veces seguidas, una serie menos.
  if (feeling === 'too_much') {
    const lastTarget = logs[0].targetReps ?? slot.reps;
    return {
      ...slot,
      sets: tooMuchTwice(history) ? Math.max(1, slot.sets - 1) : slot.sets,
      reps: slot.durationSec != null ? slot.reps : (lastTarget ?? slot.reps),
      durationSec:
        slot.durationSec != null ? Math.max(...logs.map((l) => l.durationSec ?? 0)) || slot.durationSec : null,
      weightKg: lastWeight,
      rationale: tooMuchTwice(history)
        ? 'Una serie menos: las dos últimas veces te pareció mucho.'
        : 'Mantenemos la carga: la última vez te pareció mucho.',
    };
  }

  const completed = logs.length >= slot.sets;
  // «Me quedé con ganas» permite subir aunque el esfuerzo marcado haya sido algo alto.
  const easy = avgRpe == null || avgRpe <= (feeling === 'wanted_more' ? WANTED_MORE_RPE : EASY_RPE);

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
    return {
      ...slot,
      durationSec: Math.max(slot.durationSec, lastSec || slot.durationSec),
      rationale: avgRpe != null && avgRpe >= 9 ? 'Mantenemos el tiempo: la última vez fue exigente.' : slot.rationale,
    };
  }

  const lastTarget = logs[0].targetReps ?? slot.reps ?? 0;
  const hitTarget = logs.every((l) => (l.repsDone ?? 0) >= lastTarget);

  if (wasTooHard(e.id, history)) {
    return {
      ...slot,
      reps: lastTarget || slot.reps,
      weightKg: lastWeight,
      rationale: 'Mantenemos la carga: la última vez costó demasiado.',
    };
  }

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
    const bigJump = heavier != null && lastWeight != null && heavier > lastWeight * BIG_JUMP;
    if (heavier && !bigJump) {
      return {
        ...slot,
        reps: range.min,
        weightKg: heavier,
        rationale: `Subimos a ${heavier} kg: llegaste al tope de ${range.max} reps.`,
      };
    }
    // Salto grande de peso o sin kettlebell más pesada: peldaños antes, una serie más y luego
    // bajar más lento con pausa. Cada peldaño se gana con una sesión al tope de repeticiones.
    const cap = MAIN_MAX_SETS[profile.level];
    const streak = topStreak(e.id, history, lastWeight, range.max);
    const withSet = Math.min(cap, slot.sets + 1);
    const at = { ...slot, reps: range.max, weightKg: lastWeight };
    if (streak <= 1 && slot.sets < cap) {
      return {
        ...at,
        sets: withSet,
        rationale: heavier
          ? `Una serie más antes de subir a ${heavier} kg.`
          : 'Una serie más: ya usas tu kettlebell más pesada.',
      };
    }
    if (streak <= 2 || !heavier) {
      return {
        ...at,
        sets: withSet,
        rationale: heavier
          ? `Baja en 4 s con pausa de 1 s abajo; después subimos a ${heavier} kg.`
          : 'Baja en 4 s con pausa de 1 s abajo. Al cambiar de ciclo pasamos a una variante más difícil.',
      };
    }
    return {
      ...slot,
      reps: range.min,
      weightKg: heavier,
      rationale: `Subimos a ${heavier} kg: ya dominas ${lastWeight} kg con más series y tempo lento.`,
    };
  }

  return {
    ...slot,
    reps: lastTarget || slot.reps,
    weightKg: lastWeight,
    rationale: easy
      ? 'Mantenemos la carga para completar todas las series.'
      : 'Mantenemos la carga: la última vez fue exigente.',
  };
}
