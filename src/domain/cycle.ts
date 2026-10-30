import type { WorkoutSession } from './schema';
import { dayDate } from './week';

// Ciclos de entrenamiento: bloques de 4 semanas y 3 focos seguidos. Todo se deduce
// del historial, así que no hay fecha que guardar. Tras una pausa larga se parte de nuevo.

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;
const RESTART_AFTER_MS = 21 * DAY_MS;

const WEEK_NAMES = ['Introductoria', 'Base', 'Choque', 'Descarga'] as const;
const PHASES = [
  { id: 'base', name: 'Técnica' },
  { id: 'strength', name: 'Fuerza' },
  { id: 'power', name: 'Potencia' },
] as const;

export type CycleInfo = {
  block: number; // 1, 2, 3…
  week: 1 | 2 | 3 | 4;
  weekName: (typeof WEEK_NAMES)[number];
  phase: (typeof PHASES)[number]['id'];
  phaseName: (typeof PHASES)[number]['name'];
  blockStart: string; // AAAA-MM-DD
};

const mondayOf = (d: Date) => dayDate('mon', d).getTime();
const toIso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function cycleInfo(history: Pick<WorkoutSession, 'finishedAt'>[], today = new Date()): CycleInfo {
  const dates = history.map((s) => Date.parse(s.finishedAt)).sort((a, b) => a - b);
  let start = dates[0] ?? today.getTime();
  dates.forEach((d, i) => {
    if (i > 0 && d - dates[i - 1] > RESTART_AFTER_MS) start = d;
  });
  const last = dates[dates.length - 1];
  if (last != null && today.getTime() - last > RESTART_AFTER_MS) start = today.getTime();

  const startMonday = mondayOf(new Date(start));
  // Math.round absorbe el cambio de hora entre dos lunes.
  const weeks = Math.max(0, Math.round((mondayOf(today) - startMonday) / WEEK_MS));
  const blockIndex = Math.floor(weeks / 4);
  const weekIndex = weeks % 4;
  const phase = PHASES[blockIndex % PHASES.length];
  return {
    block: blockIndex + 1,
    week: (weekIndex + 1) as CycleInfo['week'],
    weekName: WEEK_NAMES[weekIndex],
    phase: phase.id,
    phaseName: phase.name,
    blockStart: toIso(startMonday + blockIndex * 4 * WEEK_MS),
  };
}

// Ejercicios del bloque anterior: el nuevo bloque intenta cambiarlos.
export function previousBlockExercises(history: WorkoutSession[], cycle: CycleInfo): Set<string> {
  const start = Date.parse(`${cycle.blockStart}T00:00:00`);
  const since = start - 4 * WEEK_MS;
  const ids = history
    .filter((s) => {
      const d = Date.parse(s.finishedAt);
      return d >= since && d < start;
    })
    .flatMap((s) => s.sets.map((l) => l.exerciseId));
  return new Set(ids);
}

export function cycleGuide(cycle: CycleInfo) {
  const week = {
    1: 'Semana introductoria: aprender los ejercicios, una serie menos que el tope del nivel.',
    2: 'Semana base: sumar series, hasta el tope del nivel.',
    3: 'Semana de choque: más peso o una variante más difícil, con una serie menos.',
    4: 'Semana de descarga: la mitad de las series, sin subir carga.',
  }[cycle.week];
  const phase = {
    base: 'Foco técnica: ejercicios más simples y control.',
    strength: 'Foco fuerza: prioriza el bloque B y la progresión de carga.',
    power: 'Foco potencia: prioriza el bloque A con repeticiones de calidad.',
  }[cycle.phase];
  return `${week} ${phase}`;
}
