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
};

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

  return {
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
