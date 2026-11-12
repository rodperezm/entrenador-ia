import type { DayConfig, LocalProfile, WorkoutSession } from './schema';
import { techniqueStage } from './strength';
import { dayDate } from './week';

// Ciclos de entrenamiento: bloques de 4 semanas cumplidas y 3 focos seguidos. Todo se deduce
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
  previousBlockStart: string | null; // inicio del bloque anterior, si lo hubo
  stage: number; // etapa del bloque A
  preparation: boolean; // días previos al primer lunes del ciclo
};

const mondayOf = (d: Date) => dayDate('mon', d).getTime();
const toIso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Una semana del ciclo cuenta si se entrenó al menos la mitad de los días de fuerza planificados
// (mínimo 1). Si no, se repite: la exigencia sube solo cuando el cuerpo hizo el trabajo previo.
const strengthDayCount = (days: DayConfig[]) => days.filter((d) => d.active && d.blocks.main.enabled).length;
const neededOf = (planned: number) => Math.max(1, Math.ceil(planned / 2));
export const sessionsToCount = (days: DayConfig[]) => neededOf(strengthDayCount(days));

// Cuántos días de Fuerza tenía planificados la persona cada semana (lunes AAAA-MM-DD → cantidad).
// Se anota al armar cada semana: así una semana pasada se juzga con lo que se planificó entonces,
// no con la configuración de hoy (que pudo cambiar de 3 a 5 días, o al revés).
let plannedByWeek: Record<string, number> = {};
export const setPlannedHistory = (byWeek: Record<string, number>) => {
  plannedByWeek = byWeek;
};
export const weekKey = (date = new Date()) => toIso(mondayOf(date));
export const plannedThisWeek = (days: DayConfig[]) => strengthDayCount(days);

export function cycleInfo(
  history: WorkoutSession[],
  level: LocalProfile['level'],
  days: DayConfig[],
  today = new Date(),
): CycleInfo {
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

  // Se avanza por semanas cumplidas, no por calendario. Cada bloque guarda el lunes en que empezó.
  const needed = sessionsToCount(days);
  const blockStarts = [startMonday];
  let position = 0;
  for (let w = 0; w < elapsedWeeks; w++) {
    const from = startMonday + w * WEEK_MS;
    const trained = dates.filter((d) => d >= from && d < from + WEEK_MS).length;
    // Lo planificado esa semana, si quedó anotado; si no, lo de hoy.
    const planned = plannedByWeek[toIso(from)];
    if (trained < (planned != null ? neededOf(planned) : needed)) continue;
    position++;
    if (position % 4 === 0) blockStarts.push(startMonday + (w + 1) * WEEK_MS);
  }
  const blockIndex = Math.floor(position / 4);
  const weekIndex = position % 4;
  const blockStartMs = blockStarts.at(-1)!;
  const stage = techniqueStage(history, level, blockStarts);
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
    previousBlockStart: blockStarts.length > 1 ? toIso(blockStarts.at(-2)!) : null,
    stage,
    preparation,
  };
}

// Ejercicios del bloque anterior: el nuevo parte desde ellos, un peldaño más arriba.
export function previousBlockExercises(history: WorkoutSession[], cycle: CycleInfo): Set<string> {
  const start = Date.parse(`${cycle.blockStart}T00:00:00`);
  const since = cycle.previousBlockStart ? Date.parse(`${cycle.previousBlockStart}T00:00:00`) : start - 4 * WEEK_MS;
  const ids = history
    .filter((s) => {
      const d = Date.parse(s.finishedAt);
      return d >= since && d < start;
    })
    .flatMap((s) => s.sets.map((l) => l.exerciseId));
  return new Set(ids);
}

const DENSITY_FORMATS = [
  'menos descanso entre vueltas',
  'más trabajo con el mismo descanso',
  'una vuelta más con menos descanso',
];

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
    base: 'Foco técnica: ejercicios más simples y control. En B, repeticiones altas del rango (hasta 12), baja en 3 s con pausa abajo, peso cómodo y 90 s de descanso.',
    strength:
      'Foco fuerza: prioriza el bloque B y la progresión de carga. En B, repeticiones bajas del rango (desde 5), peso exigente con 1 o 2 en reserva y 2 a 3 min de descanso.',
    power:
      'Foco potencia: prioriza el bloque A con repeticiones de calidad. En B, repeticiones medias (cerca de 7), sube lo más rápido posible y 2 min de descanso.',
  }[cycle.phase];
  const finisher =
    level === 'advanced' && cycle.week !== 4
      ? ` En el bloque C aplica densidad, salvo en levantamientos muy técnicos: ${DENSITY_FORMATS[(cycle.block - 1) % DENSITY_FORMATS.length]}.`
      : '';
  return `${week} ${phase}${finisher}`;
}
