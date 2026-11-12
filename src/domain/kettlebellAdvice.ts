import type { Exercise, LocalProfile, WorkoutSession } from './schema';
import { painOf } from './schema';
import { strengthRole } from './strength';

// Cuándo sugerir una kettlebell más pesada. La app ya progresa sin ella (más series y más tensión),
// así que es solo un aviso: aparece cuando la persona domina su pesa más pesada en los ejercicios
// donde el cuerpo la supera primero (piernas, cadera y remos), sin dolor.

const STANDARD_KG = [8, 12, 16, 20, 24, 28, 32];
const SESSIONS_NEEDED = 2; // sesiones seguidas al tope, con esfuerzo controlado
const EASY_RPE = 7;
const RECENT_MS = 28 * 24 * 3600 * 1000;
// Donde una pesa liviana se queda corta antes: piernas, cadera y tirón.
const OUTGROWN_FIRST = ['hinge', 'squat', 'lunge', 'pull_horizontal'];

export type KettlebellAdvice = {
  currentKg: number;
  nextKg: number;
  /** Ejercicios en los que ya domina su pesa más pesada. */
  exercises: string[];
};

export function heavierKettlebellAdvice(input: {
  history: WorkoutSession[]; // la más reciente primero
  profile: Pick<LocalProfile, 'kettlebellWeightsKg'>;
  exercises: Exercise[];
  now?: number;
}): KettlebellAdvice | null {
  const { history, profile, exercises, now = Date.now() } = input;
  const currentKg = Math.max(0, ...profile.kettlebellWeightsKg);
  const nextKg = STANDARD_KG.find((kg) => kg > currentKg);
  if (!currentKg || !nextKg) return null;

  const recent = history.filter((s) => now - Date.parse(s.finishedAt) < RECENT_MS);
  const mastered = exercises.filter((e) => {
    const role = strengthRole(e);
    const max = e.prescription.repRange?.max;
    if (!max || (role !== 'A' && role !== 'B')) return false;
    if (!e.equipment.required.includes('kettlebell') || e.kettlebellCount === 2) return false;
    if (!OUTGROWN_FIRST.includes(e.movementPattern)) return false;
    // Sus últimas sesiones con este ejercicio (sin contar circuitos HIIT o AMRAP).
    const sessions = recent
      .map((s) => s.sets.filter((l) => l.exerciseId === e.id && !l.format))
      .filter((logs) => logs.length > 0)
      .slice(0, SESSIONS_NEEDED);
    if (sessions.length < SESSIONS_NEEDED) return false;
    return sessions.every((logs) =>
      logs.every(
        (l) =>
          l.weightKg === currentKg && (l.repsDone ?? 0) >= max && l.rpe != null && l.rpe <= EASY_RPE && painOf(l) === 0,
      ),
    );
  });
  if (!mastered.length) return null;
  return { currentKg, nextKg, exercises: mastered.map((e) => e.name.es) };
}
