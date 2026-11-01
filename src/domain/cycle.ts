import type { LocalProfile, WorkoutSession } from './schema';
import { techniqueStage } from './strength';
import { dayDate } from './week';

// Ciclos de entrenamiento: bloques de 4 semanas y 3 focos seguidos. Todo se deduce
// del historial, así que no hay fecha que guardar. Tras una pausa larga se parte de nuevo.

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;
const RESTART_AFTER_MS = 21 * DAY_MS;
const BEGINNER_MAX_TECHNIQUE_BLOCKS = 2;
const SWING_STAGE = 3;

const WEEK_NAMES = [
  'Introductoria (Adaptación)',
  'Base (Aumento gradual)',
  'Máxima Intensidad',
  'Descarga (Recuperación)',
] as const;
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
  stage: number; // etapa del bloque A
  preparation: boolean; // días previos al primer lunes del ciclo
};

const mondayOf = (d: Date) => dayDate('mon', d).getTime();
const toIso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function cycleInfo(history: WorkoutSession[], level: LocalProfile['level'], today = new Date()): CycleInfo {
  const dates = history.map((s) => Date.parse(s.finishedAt)).sort((a, b) => a - b);
  let start = dates[0] ?? today.getTime();
  dates.forEach((d, i) => {
    if (i > 0 && d - dates[i - 1] > RESTART_AFTER_MS) start = d;
  });
  const last = dates[dates.length - 1];
  if (last != null && today.getTime() - last > RESTART_AFTER_MS) start = today.getTime();

  // El ciclo parte siempre un lunes: lo anterior es preparación, fuera del registro del bloque.
  const startDate = new Date(start);
  const startMonday = mondayOf(startDate) + (startDate.getDay() === 1 ? 0 : WEEK_MS);
  // Math.round absorbe el cambio de hora entre dos lunes.
  const elapsedWeeks = Math.round((mondayOf(today) - startMonday) / WEEK_MS);
  const preparation = elapsedWeeks < 0;
  const weeks = Math.max(0, elapsedWeeks);
  const blockIndex = Math.floor(weeks / 4);
  const weekIndex = weeks % 4;
  const blockStartMs = startMonday + blockIndex * 4 * WEEK_MS;
  const stage = techniqueStage(history, level, blockStartMs);
  // El principiante sigue en Técnica hasta dominar el swing, o por dos bloques como máximo.
  const staysOnTechnique = level === 'beginner' && stage < SWING_STAGE && blockIndex < BEGINNER_MAX_TECHNIQUE_BLOCKS;
  const phase = staysOnTechnique ? PHASES[0] : PHASES[blockIndex % PHASES.length];
  return {
    block: blockIndex + 1,
    week: (weekIndex + 1) as CycleInfo['week'],
    weekName: WEEK_NAMES[weekIndex],
    phase: phase.id,
    phaseName: phase.name,
    blockStart: toIso(blockStartMs),
    stage,
    preparation,
  };
}

// Ejercicios del bloque anterior: el nuevo parte desde ellos, un peldaño más arriba.
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

const DENSITY_FORMATS = ['menos descanso entre vueltas', 'más trabajo con el mismo descanso', 'una vuelta más con menos descanso'];

export function cycleGuide(cycle: CycleInfo, level: LocalProfile['level']) {
  const week = {
    1: 'Semana introductoria: aprender los ejercicios, una serie menos que el tope del nivel.',
    2: 'Semana base: sumar series, hasta el tope del nivel.',
    3:
      level === 'beginner'
        ? 'Semana de máxima intensidad para principiante: mismo peso, prioridad a la técnica; no subir carga.'
        : 'Semana de máxima intensidad, la más exigente del ciclo: más peso o variante difícil; con una sola kettlebell, más tempo o menos descanso.',
    4: 'Semana de descarga: la mitad de las series, sin subir carga.',
  }[cycle.week];
  const phase = {
    base: 'Foco técnica: ejercicios más simples y control.',
    strength: 'Foco fuerza: prioriza el bloque B y la progresión de carga.',
    power: 'Foco potencia: prioriza el bloque A con repeticiones de calidad.',
  }[cycle.phase];
  const finisher =
    level === 'advanced' && cycle.week !== 4
      ? ` En el bloque C aplica densidad, salvo en levantamientos muy técnicos: ${DENSITY_FORMATS[(cycle.block - 1) % DENSITY_FORMATS.length]}.`
      : '';
  return `${week} ${phase}${finisher}`;
}
