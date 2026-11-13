import { markLabel, markScore } from './finisher';
import type { Exercise, SetLog, WorkoutSession } from './schema';
import { painOf } from './schema';
import { strengthRole } from './strength';
import { dayDate } from './week';

// Lo que se ve en «Tu progreso»: todo sale del historial de entrenamientos.

const DAY_MS = 24 * 3600 * 1000;
const PAIN_WINDOW_MS = 28 * DAY_MS;

export type ExerciseProgress = {
  id: string;
  name: string;
  first: string;
  last: string;
  improved: boolean;
  sessions: number;
};

export type AmrapProgress = { id: string; name: string; first: string; last: string; improved: boolean; times: number };

export type PainNote = { id: string; name: string; level: number; date: Date };

export type ProgressSummary = {
  sessions: number;
  minutes: number;
  thisWeek: number;
  weeksInARow: number;
  exercises: ExerciseProgress[];
  pains: PainNote[];
  amrap: AmrapProgress[];
  /** Sesiones de cada una de las últimas semanas, de la más antigua a la actual. */
  weeks: { monday: number; count: number }[];
  /** Últimas 4 semanas: sesiones sin ninguna molestia, y cómo dijo la persona que terminó. */
  body: { sessions: number; painFree: number; answered: number; right: number; wantedMore: number; tooMuch: number };
};

export const PROGRESS_WEEKS = 6;

// El mejor esfuerzo de un ejercicio en una sesión: primero el peso, luego reps o segundos.
const score = (s: SetLog) => [s.weightKg ?? 0, s.repsDone ?? 0, s.durationSec ?? 0];
const isBetter = (a: SetLog, b: SetLog) => {
  const [x, y] = [score(a), score(b)];
  const i = x.findIndex((v, n) => v !== y[n]);
  return i >= 0 && x[i] > y[i];
};
const bestSet = (sets: SetLog[]) => sets.reduce((best, s) => (isBetter(s, best) ? s : best));

const setLabel = (s: SetLog) => {
  const work = s.repsDone ? `${s.repsDone} reps` : `${s.durationSec ?? 0} s`;
  return s.weightKg ? `${s.weightKg} kg × ${work}` : work;
};

const mondayMs = (d: Date) => dayDate('mon', d).getTime();

// Semanas seguidas con al menos una sesión. La semana actual aún puede estar en curso.
function weekStreak(mondays: Set<number>, now: Date) {
  let monday = mondayMs(now);
  const previous = (ms: number) => mondayMs(new Date(ms - DAY_MS));
  if (!mondays.has(monday)) monday = previous(monday);
  let weeks = 0;
  while (mondays.has(monday)) {
    weeks++;
    monday = previous(monday);
  }
  return weeks;
}

export function progressSummary(history: WorkoutSession[], exercises: Exercise[], now = new Date()): ProgressSummary {
  const sessions = [...history].sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt));
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const mondays = new Set(sessions.map((s) => mondayMs(new Date(s.finishedAt))));

  const perExercise = new Map<string, SetLog[]>();
  for (const s of sessions) {
    const done = s.sets.filter((l) => {
      const e = byId.get(l.exerciseId);
      return e?.blockTypes.includes('main_strength') && strengthRole(e) && !l.format && (l.repsDone || l.durationSec);
    });
    for (const id of new Set(done.map((l) => l.exerciseId))) {
      const best = bestSet(done.filter((l) => l.exerciseId === id));
      perExercise.set(id, [...(perExercise.get(id) ?? []), best]);
    }
  }

  const list = [...perExercise.entries()].map(([id, bests]) => {
    const first = bests[0];
    const last = bests[bests.length - 1];
    return {
      id,
      name: byId.get(id)!.name.es,
      first: setLabel(first),
      last: setLabel(last),
      improved: isBetter(last, first),
      sessions: bests.length,
    };
  });

  const seen = new Set<string>();
  const pains: PainNote[] = [];
  for (const s of [...sessions].reverse()) {
    if (now.getTime() - Date.parse(s.finishedAt) > PAIN_WINDOW_MS) break;
    for (const id of new Set(s.sets.map((l) => l.exerciseId))) {
      if (seen.has(id)) continue;
      seen.add(id);
      const level = Math.max(...s.sets.filter((l) => l.exerciseId === id).map(painOf));
      if (level > 0) pains.push({ id, name: byId.get(id)?.name.es ?? id, level, date: new Date(s.finishedAt) });
    }
  }

  // Cada desafío se compara consigo mismo: mismos ejercicios y mismos minutos.
  const challenges = new Map<string, WorkoutSession['amrap'][]>();
  for (const s of sessions) {
    if (!s.amrap) continue;
    const key = `${s.amrap.minutes}:${s.amrap.exerciseIds.join(',')}`;
    challenges.set(key, [...(challenges.get(key) ?? []), s.amrap]);
  }
  const amrap = [...challenges.entries()].map(([id, marks]) => {
    const first = marks[0]!;
    const last = marks[marks.length - 1]!;
    return {
      id,
      name: `${last.minutes} min: ${last.exerciseIds.map((e) => byId.get(e)?.name.es ?? e).join(', ')}`,
      first: markLabel(first),
      last: markLabel(last),
      improved: markScore(last) > markScore(first),
      times: marks.length,
    };
  });

  // Constancia: cuántas sesiones hubo en cada una de las últimas semanas.
  const thisMonday = mondayMs(now);
  const weeks = Array.from({ length: PROGRESS_WEEKS }, (_, i) => {
    let monday = thisMonday;
    for (let n = 0; n < PROGRESS_WEEKS - 1 - i; n++) monday = mondayMs(new Date(monday - DAY_MS));
    return { monday, count: sessions.filter((x) => mondayMs(new Date(x.finishedAt)) === monday).length };
  });

  // Cómo responde el cuerpo: lo que la persona marcó en las últimas 4 semanas.
  const recent = sessions.filter((x) => now.getTime() - Date.parse(x.finishedAt) <= PAIN_WINDOW_MS);
  const feelings = recent.flatMap((x) => (x.feeling ? [x.feeling] : []));
  const body = {
    sessions: recent.length,
    painFree: recent.filter((x) => x.sets.every((l) => painOf(l) === 0)).length,
    answered: feelings.length,
    right: feelings.filter((f) => f === 'right').length,
    wantedMore: feelings.filter((f) => f === 'wanted_more').length,
    tooMuch: feelings.filter((f) => f === 'too_much').length,
  };

  return {
    weeks,
    body,
    sessions: sessions.length,
    minutes: Math.round(
      sessions.reduce((t, s) => t + Math.max(0, Date.parse(s.finishedAt) - Date.parse(s.startedAt)), 0) / 60000,
    ),
    thisWeek: sessions.filter((s) => mondayMs(new Date(s.finishedAt)) === mondayMs(now)).length,
    weeksInARow: weekStreak(mondays, now),
    exercises: list.sort((a, b) => Number(b.improved) - Number(a.improved) || b.sessions - a.sessions),
    pains,
    amrap,
  };
}
