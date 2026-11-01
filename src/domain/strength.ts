import type { DayConfig, Exercise, ExerciseSlot, StrengthRole, WorkoutSession } from './schema';
import { painOf } from './schema';

// Método de Fuerza: mandan los patrones de movimiento, en sesiones de cuerpo completo
// ordenadas en A potencia, B fuerza y C remate. Los músculos solo informan y equilibran.

type Level = 'beginner' | 'intermediate' | 'advanced';
type Pattern = Exercise['movementPattern'];

export type Intensity = 'intense' | 'moderate' | 'light';

// Etapas del bloque A: el balístico se gana con técnica y sin dolor.
export const A_STAGES = [
  ['kb_deadlift', 'kb_sumo_deadlift'],
  ['kb_dead_stop_swing'],
  ['kb_swing_2h'],
  ['kb_swing_1h', 'kb_clean', 'kb_snatch', 'kb_high_pull', 'kb_push_press', 'kb_clean_press', 'kb_jerk', 'kb_long_cycle'],
];
const START_STAGE: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 3 };
const SESSIONS_TO_ADVANCE = 2;
const BLOCK_MS = 28 * 24 * 3600 * 1000;

const FINISHER_IDS = ['kb_swing_finisher', 'kb_complex'];
const B_PATTERNS: Pattern[] = [
  'squat',
  'lunge',
  'hinge',
  'push_horizontal',
  'push_vertical',
  'pull_horizontal',
  'pull_vertical',
];

// null = no entra a Fuerza: aislados, movilidad, gemelos o cardio.
export function strengthRole(e: Exercise): StrengthRole | null {
  if (FINISHER_IDS.includes(e.id) || e.movementPattern === 'carry' || e.movementPattern.startsWith('core_')) {
    return 'C';
  }
  if (e.restrictionFlags.includes('ballistic')) return 'A';
  return B_PATTERNS.includes(e.movementPattern) && e.mechanics === 'compound' ? 'B' : null;
}

export function slotRole(e: Exercise, stage: number): StrengthRole | null {
  return stage === 1 && A_STAGES[0].includes(e.id) ? 'A' : strengthRole(e);
}

const ROLE_ORDER: StrengthRole[] = ['A', 'B', 'C'];
export const sortByRole = (slots: ExerciseSlot[]) =>
  [...slots].sort((a, b) => ROLE_ORDER.indexOf(a.role ?? 'B') - ROLE_ORDER.indexOf(b.role ?? 'B'));

// Cada lugar de la sesión pide un rol y patrones. El orden importa: al subir la cantidad
// se agrega lo siguiente, y si falta tiempo se quita desde el final.
export type SessionNeed = { role: StrengthRole; patterns?: Pattern[]; explosive?: boolean };

export function sessionNeeds(power: boolean, dayIndex: number): SessionNeed[] {
  const push: Pattern[] = dayIndex % 2 ? ['push_vertical', 'push_horizontal'] : ['push_horizontal', 'push_vertical'];
  const pull: Pattern[] = dayIndex % 2 ? ['pull_vertical', 'pull_horizontal'] : ['pull_horizontal', 'pull_vertical'];
  const second: SessionNeed = { role: 'A', explosive: true };
  const first: SessionNeed[] = [{ role: 'A', patterns: ['hinge'] }];
  return [
    ...(power ? [...first, second] : first),
    { role: 'B', patterns: push },
    { role: 'B', patterns: pull },
    { role: 'B', patterns: ['squat', 'lunge'] },
    { role: 'C' },
    ...(power ? [] : [second]),
    { role: 'B', patterns: ['lunge', 'squat'] },
    { role: 'B', patterns: ['hinge'] },
    { role: 'B', patterns: [...push].reverse() },
    { role: 'B', patterns: [...pull].reverse() },
  ];
}

// Etapa del bloque A según el nivel y lo logrado en las sesiones anteriores. Se avanza solo al
// cambiar de bloque, una etapa cada vez, para mantener los ejercicios fijos; el dolor retrocede al tiro.
export function techniqueStage(history: WorkoutSession[], level: Level, blockStart: number) {
  let stage = START_STAGE[level];
  const oldestFirst = [...history].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  let good = 0;
  let hurt = false;
  let block: number | null = null;
  const closeBlock = () => {
    if (block != null && block >= 0 && !hurt && good >= SESSIONS_TO_ADVANCE) {
      stage = Math.min(A_STAGES.length, stage + 1);
    }
    good = 0;
    hurt = false;
  };
  for (const session of oldestFirst) {
    const sessionBlock = Math.floor((blockStart - Date.parse(session.finishedAt)) / BLOCK_MS);
    if (sessionBlock !== block) {
      closeBlock();
      block = sessionBlock;
    }
    const logs = session.sets.filter((l) => A_STAGES[stage - 1].includes(l.exerciseId));
    if (!logs.length) continue;
    const pain = logs.some((l) => painOf(l) > 0);
    if (pain || logs.some((l) => l.techniqueOk === false)) {
      stage = Math.max(1, stage - (pain ? 1 : 0));
      good = 0;
      hurt = hurt || pain;
    } else if (logs.some((l) => l.techniqueOk === true)) {
      good++;
    }
  }
  closeBlock();
  return stage;
}

// Exigencia de cada sesión de Fuerza: con 4 días o más se alternan para recuperar.
const WEEK_INTENSITY: Partial<Record<number, Intensity[]>> = {
  4: ['intense', 'moderate', 'intense', 'moderate'],
  5: ['intense', 'moderate', 'light', 'intense', 'moderate'],
  6: ['intense', 'moderate', 'light', 'intense', 'moderate', 'moderate'],
  7: ['intense', 'moderate', 'light', 'intense', 'moderate', 'moderate', 'light'],
};

export function dayIntensity(days: DayConfig[], day: DayConfig['day']): Intensity {
  const strengthDays = days.filter((d) => d.active && d.blocks.main.enabled && !d.gentleStrength);
  return WEEK_INTENSITY[strengthDays.length]?.[strengthDays.findIndex((d) => d.day === day)] ?? 'intense';
}

// ---------- Información al usuario ----------

const ZONES: Partial<Record<string, string>> = {
  pectoralis_major: 'Pecho',
  latissimus_dorsi: 'Espalda',
  trapezius: 'Espalda',
  rhomboids: 'Espalda',
  deltoid_anterior: 'Hombros',
  deltoid_lateral: 'Hombros',
  deltoid_posterior: 'Hombros',
  biceps: 'Brazos',
  triceps: 'Brazos',
  forearms: 'Brazos',
  quadriceps: 'Cuádriceps',
  hamstrings: 'Cadena posterior',
  gluteus_maximus: 'Cadena posterior',
  gluteus_medius: 'Cadena posterior',
  rectus_abdominis: 'Core',
  obliques: 'Core',
  erector_spinae: 'Core',
};

const PATTERN_LABELS: Partial<Record<Pattern, string>> = {
  squat: 'Sentadilla',
  lunge: 'Sentadilla',
  hinge: 'Bisagra',
  push_horizontal: 'Empuje',
  push_vertical: 'Empuje',
  pull_horizontal: 'Tirón',
  pull_vertical: 'Tirón',
  carry: 'Acarreo',
};

export function strengthInfo(e: Exercise) {
  const zones = [...new Set(e.anatomy.primary.flatMap((m) => ZONES[m.muscle] ?? []))].join(', ');
  const pattern = PATTERN_LABELS[e.movementPattern];
  return [pattern, zones].filter(Boolean).join(' · ');
}
