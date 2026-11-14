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
  // Desde aquí los balísticos libres se ganan de a uno: primero el swing a una mano, después el
  // clean y sus parientes, al final el snatch y el jerk. Cada etapa pide confirmar su propia técnica.
  ['kb_swing_1h'],
  ['kb_clean', 'kb_high_pull', 'kb_push_press', 'kb_clean_press', 'kb_double_swing'],
  ['kb_snatch', 'kb_jerk', 'kb_long_cycle'],
];
export const FREE_BALLISTIC_STAGE = 4;
// Lo que la persona ya puede usar en el bloque A: su etapa y, en los balísticos libres, también
// las etapas que ya superó.
export const unlockedA = (stage: number): string[] =>
  stage < FREE_BALLISTIC_STAGE ? (A_STAGES[stage - 1] ?? []) : A_STAGES.slice(FREE_BALLISTIC_STAGE - 1, stage).flat();
// El nivel es declarado: nadie parte en el swing libre sin haber confirmado antes la técnica en la app.
const START_STAGE: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 2 };
const SESSIONS_TO_ADVANCE = 2;

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

// Brazos (bíceps y tríceps aislados): entran como remate C, para que la semana también los trabaje.
export const isArmAccessory = (e: Exercise) =>
  e.movementPattern === 'isolation_arm' &&
  e.blockTypes.includes('main_strength') &&
  e.anatomy.primary.some((m) => m.muscle === 'biceps' || m.muscle === 'triceps');

// Accesorios de zona: aislados de Fuerza que no son de brazos (gemelos, glúteos, isquiotibiales,
// hombros, trapecio, pecho). Solo entran cuando la Fuerza se divide por zonas (4 a 6 días): en
// cuerpo completo no hay lugar para ellos.
const LOWER_MUSCLES = ['quadriceps', 'hamstrings', 'gluteus_maximus', 'gluteus_medius', 'adductors', 'calves'];
export const isZoneAccessory = (e: Exercise) =>
  e.mechanics === 'isolation' &&
  e.blockTypes.includes('main_strength') &&
  !e.movementPattern.startsWith('core_') &&
  !isArmAccessory(e);
export const zoneOf = (e: Exercise): 'lower' | 'upper' =>
  LOWER_MUSCLES.includes(e.anatomy.primary[0].muscle) ? 'lower' : 'upper';

// null = no entra a Fuerza: movilidad, cardio y estiramientos.
export function strengthRole(e: Exercise): StrengthRole | null {
  if (
    FINISHER_IDS.includes(e.id) ||
    e.movementPattern === 'carry' ||
    e.movementPattern.startsWith('core_') ||
    isArmAccessory(e) ||
    isZoneAccessory(e)
  ) {
    return 'C';
  }
  if (e.restrictionFlags.includes('ballistic')) return 'A';
  return B_PATTERNS.includes(e.movementPattern) && e.mechanics === 'compound' ? 'B' : null;
}

export function slotRole(e: Exercise, stage: number): StrengthRole | null {
  return stage === 1 && A_STAGES[0].includes(e.id) ? 'A' : strengthRole(e);
}

// Descanso mínimo entre series: los compuestos pesados necesitan recuperar para mantener la técnica.
export const MIN_REST_SEC: Record<StrengthRole, number> = { A: 120, B: 90, C: 45 };
export const POWER_REPS_MAX = 10;

// Anclas del día: se mantienen todo el ciclo para medir el progreso. Son el ejercicio de potencia (A)
// y el principal de piernas (o, si no hay, el primer B). El resto de Fuerza rota cada semana.
export function anchorIds(slots: ExerciseSlot[], byId: Map<string, Exercise>): string[] {
  const a = slots.filter((s) => s.role === 'A').map((s) => s.exerciseId);
  const b = slots.filter((s) => s.role === 'B');
  const legs = b.find((s) => ['squat', 'lunge'].includes(byId.get(s.exerciseId)?.movementPattern ?? ''));
  const firstB = legs ?? b[0];
  return [
    ...a.slice(0, 1),
    ...(firstB ? [firstB.exerciseId] : []),
    ...(a.length
      ? []
      : b
          .filter((s) => s !== firstB)
          .slice(0, 1)
          .map((s) => s.exerciseId)),
  ];
}

const ROLE_ORDER: StrengthRole[] = ['A', 'B', 'C'];
export const sortByRole = (slots: ExerciseSlot[]) =>
  [...slots].sort((a, b) => ROLE_ORDER.indexOf(a.role ?? 'B') - ROLE_ORDER.indexOf(b.role ?? 'B'));

// Cada lugar de la sesión pide un rol y patrones. El orden importa: al subir la cantidad
// se agrega lo siguiente, y si falta tiempo se quita desde el final.
// `kind`: qué remate C se busca (brazos, acarreo, core o accesorio de la zona). Sin él, el de siempre.
export type CKind = 'arms' | 'carry' | 'core' | 'lower' | 'upper';
export type SessionNeed = {
  role: StrengthRole;
  patterns?: Pattern[];
  explosive?: boolean;
  kind?: CKind;
  muscle?: 'biceps' | 'triceps'; // remate de brazos: cuál se prefiere
};

// ---------- División de la semana ----------
// Con 1 a 3 días de Fuerza, cada sesión es de cuerpo completo. Con 4 a 6, repetir cuerpo completo
// no deja recuperar: la semana se divide en tren inferior y tren superior (y, con 5, un día de
// potencia y core). Siempre queda al menos un día sin Fuerza.
export type DayFocus = 'full' | 'lower' | 'upper' | 'power_core';
export const MAX_STRENGTH_DAYS = 6;
const SPLIT_FROM = 4;

const SPLITS: Record<number, DayFocus[]> = {
  4: ['lower', 'upper', 'lower', 'upper'],
  5: ['lower', 'upper', 'power_core', 'lower', 'upper'],
  6: ['lower', 'upper', 'lower', 'upper', 'lower', 'upper'],
};
// Exigencia en ola: la primera vuelta de cada zona es la fuerte y las siguientes bajan.
const SPLIT_INTENSITY: Record<number, Intensity[]> = {
  4: ['intense', 'intense', 'moderate', 'moderate'],
  5: ['intense', 'intense', 'moderate', 'moderate', 'moderate'],
  6: ['intense', 'intense', 'moderate', 'moderate', 'light', 'light'],
};

const strengthDaysOf = (days: DayConfig[]) =>
  days.filter((d) => d.active && d.blocks.main.enabled && !d.gentleStrength);

export const isSplitWeek = (days: DayConfig[]) => strengthDaysOf(days).length >= SPLIT_FROM;

// Zona de cada día de Fuerza y cuántas veces ha tocado esa zona antes en la semana.
// Un séptimo día de Fuerza no existe: queda como potencia y core, suave (la app pide un día libre).
export function weekFocus(days: DayConfig[]): Partial<Record<DayConfig['day'], { focus: DayFocus; turn: number }>> {
  const strength = strengthDaysOf(days);
  const split = SPLITS[Math.min(strength.length, MAX_STRENGTH_DAYS)];
  const seen: Partial<Record<DayFocus, number>> = {};
  return Object.fromEntries(
    strength.map((d, i) => {
      const focus: DayFocus = split ? (split[i] ?? 'power_core') : 'full';
      const turn = seen[focus] ?? 0;
      seen[focus] = turn + 1;
      return [d.day, { focus, turn }];
    }),
  );
}

// Patrones de fuerza (B) que no corresponden a la zona del día.
const OFF_ZONE: Record<DayFocus, Pattern[]> = {
  full: [],
  lower: ['push_horizontal', 'push_vertical', 'pull_horizontal', 'pull_vertical'],
  upper: ['squat', 'lunge', 'hinge'],
  power_core: ['push_horizontal', 'push_vertical', 'pull_horizontal', 'pull_vertical', 'squat', 'lunge'],
};
// ¿Este ejercicio de Fuerza está fuera de la zona del día? (Remates C de core y acarreo valen siempre.)
export function offZone(e: Exercise, focus: DayFocus) {
  if (focus === 'full') return false;
  if (isArmAccessory(e)) return focus !== 'upper';
  if (isZoneAccessory(e)) return focus === 'power_core' || zoneOf(e) !== focus;
  if (e.movementPattern === 'carry' || e.movementPattern.startsWith('core_')) return false;
  return OFF_ZONE[focus].includes(e.movementPattern);
}

// Cómo se arma el día, en palabras: se le envía a la IA junto con la zona.
export function focusGuide(focus: DayFocus, turn: number): string | null {
  if (focus === 'lower') {
    return `Tren inferior, sin empujes ni tirones. A: bisagra de potencia de la etapa disponible. B: ${
      turn % 2 ? 'zancada o una pierna primero, luego sentadilla' : 'sentadilla primero, luego zancada o una pierna'
    }, y una bisagra de fuerza distinta de A. Remate C: core o un accesorio de piernas (isquiotibiales, glúteos, gemelos).`;
  }
  if (focus === 'upper') {
    const pushDay = turn % 2 === 0;
    return `Tren superior, sin bisagra ni piernas y sin bloque A. Tres compuestos B: ${
      pushDay ? 'dos de empuje y uno de tirón' : 'dos de tirón y uno de empuje'
    } (alterna vertical y horizontal). Remate C de brazos: ${pushDay ? 'bíceps' : 'tríceps'}. Con más lugares, agrega el otro patrón, el otro brazo y un accesorio de hombros o espalda alta.`;
  }
  if (focus === 'power_core') {
    return 'Potencia y core: A bisagra técnica con pocas repeticiones; el resto solo C: acarreos y core variado (anti-extensión, anti-rotación, rotación). Sin empujes, tirones ni piernas, a exigencia moderada.';
  }
  return null;
}

export const FOCUS_LABEL: Record<DayFocus, string> = {
  full: 'Cuerpo completo',
  lower: 'Tren inferior',
  upper: 'Tren superior',
  power_core: 'Potencia y core',
};

// Tren inferior: potencia de cadera, sentadilla, bisagra y una pierna; cierra con core o un accesorio.
// La segunda vez de la semana parte por el trabajo a una pierna, para variar el énfasis.
function lowerNeeds(power: boolean, turn: number): SessionNeed[] {
  const knee: SessionNeed[] = [
    { role: 'B', patterns: ['squat', 'lunge'] },
    { role: 'B', patterns: ['lunge', 'squat'] },
  ];
  return [
    { role: 'A', patterns: ['hinge'] },
    ...(power ? [{ role: 'A' as const, explosive: true }] : []),
    ...(turn % 2 ? [...knee].reverse() : knee),
    { role: 'B', patterns: ['hinge'] },
    { role: 'C', kind: 'lower' },
    { role: 'C', kind: 'core' },
    { role: 'C', kind: 'lower' },
    { role: 'B', patterns: ['squat', 'lunge'] },
  ];
}

// Tren superior: tres compuestos y un remate de brazos. Un día lleva dos empujes y un tirón, y el
// siguiente al revés; el brazo del remate compensa (bíceps el día de más empuje, tríceps el de más
// tirón). Así la semana queda pareja en empuje, tirón y brazos.
function upperNeeds(turn: number): SessionNeed[] {
  const pushFirst = turn % 2 === 0;
  const push: Pattern[] = pushFirst ? ['push_vertical', 'push_horizontal'] : ['push_horizontal', 'push_vertical'];
  const pull: Pattern[] = pushFirst ? ['pull_horizontal', 'pull_vertical'] : ['pull_vertical', 'pull_horizontal'];
  const main: SessionNeed = { role: 'B', patterns: pushFirst ? push : pull };
  const other: SessionNeed = { role: 'B', patterns: pushFirst ? pull : push };
  const mainAgain: SessionNeed = { role: 'B', patterns: [...(pushFirst ? push : pull)].reverse() };
  const otherAgain: SessionNeed = { role: 'B', patterns: [...(pushFirst ? pull : push)].reverse() };
  return [
    main,
    other,
    mainAgain,
    { role: 'C', kind: 'arms', muscle: pushFirst ? 'biceps' : 'triceps' },
    otherAgain,
    { role: 'C', kind: 'arms', muscle: pushFirst ? 'triceps' : 'biceps' },
    { role: 'C', kind: 'upper' },
    { role: 'C', kind: 'core' },
  ];
}

// Potencia y core: bisagra técnica, acarreos y estabilidad de tronco. No repite los empujes ni las piernas.
const POWER_CORE_NEEDS: SessionNeed[] = [
  { role: 'A', patterns: ['hinge'] },
  { role: 'C', kind: 'carry' },
  { role: 'C', kind: 'core' },
  { role: 'C', kind: 'core' },
  { role: 'C', kind: 'carry' },
  { role: 'C', kind: 'core' },
];

export function sessionNeeds(power: boolean, dayIndex: number, focus: DayFocus = 'full', turn = 0): SessionNeed[] {
  if (focus === 'lower') return lowerNeeds(power, turn);
  if (focus === 'upper') return upperNeeds(turn);
  if (focus === 'power_core') return POWER_CORE_NEEDS;
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
// `blockStarts` son los lunes en que empezó cada bloque, del primero al actual.
// `start`: la etapa de partida (ver `startStage` en domain/experience) o, por compatibilidad, un nivel.
export function techniqueStage(history: WorkoutSession[], start: Level | number, blockStarts: number[]) {
  let stage = typeof start === 'number' ? start : START_STAGE[start];
  const oldestFirst = [...history].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  const current = blockStarts.length - 1;
  // -1 = antes del primer bloque (preparación), que también cuenta como bloque cerrado.
  const blockOf = (t: number) => blockStarts.filter((s) => s <= t).length - 1;
  let good = 0;
  let hurt = false;
  let block: number | null = null;
  const closeBlock = () => {
    if (block != null && block !== current && !hurt && good >= SESSIONS_TO_ADVANCE) {
      stage = Math.min(A_STAGES.length, stage + 1);
    }
    good = 0;
    hurt = false;
  };
  for (const session of oldestFirst) {
    const sessionBlock = blockOf(Date.parse(session.finishedAt));
    if (sessionBlock !== block) {
      closeBlock();
      block = sessionBlock;
    }
    // El dolor en cualquier balístico ya ganado retrocede; para avanzar cuenta solo la etapa actual.
    const open = session.sets.filter((l) => unlockedA(stage).includes(l.exerciseId));
    const logs = open.filter((l) => A_STAGES[stage - 1].includes(l.exerciseId));
    const pain = open.some((l) => painOf(l) > 0);
    if (!logs.length && !pain) continue;
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

const BEGINNER_FULL_DAYS = 3; // el principiante entrena fuerte hasta 3 días; los demás son de técnica
const DAY_ORDER: DayConfig['day'][] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function dayIntensity(days: DayConfig[], day: DayConfig['day'], level: Level): Intensity {
  const strengthDays = days.filter((d) => d.active && d.blocks.main.enabled && !d.gentleStrength);
  const i = strengthDays.findIndex((d) => d.day === day);
  if (level === 'beginner' && i >= BEGINNER_FULL_DAYS) return 'light';
  // Un séptimo día de Fuerza siempre es suave: la semana necesita un día libre.
  if (i >= MAX_STRENGTH_DAYS) return 'light';
  // Dividida por zonas, dos días fuertes seguidos no chocan: trabajan zonas distintas.
  const split = SPLIT_INTENSITY[Math.min(strengthDays.length, MAX_STRENGTH_DAYS)];
  if (split) return split[i] ?? 'light';
  const intensity = WEEK_INTENSITY[strengthDays.length]?.[i] ?? 'intense';
  // Nunca dos días intensos seguidos en el calendario: el segundo pasa a moderado.
  const prev = strengthDays.at(i - 1);
  if (intensity === 'intense' && i > 0 && prev && DAY_ORDER.indexOf(day) - DAY_ORDER.indexOf(prev.day) === 1) {
    return dayIntensity(days, prev.day, level) === 'intense' ? 'moderate' : intensity;
  }
  return intensity;
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
