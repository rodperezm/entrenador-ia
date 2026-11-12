import type { DayConfig, DayOfWeek, WeekConfig } from './schema';
import { MAX_STRENGTH_DAYS, weekFocus } from './strength';

export const DAYS: { id: DayOfWeek; short: string; long: string }[] = [
  { id: 'mon', short: 'Lun', long: 'Lunes' },
  { id: 'tue', short: 'Mar', long: 'Martes' },
  { id: 'wed', short: 'Mié', long: 'Miércoles' },
  { id: 'thu', short: 'Jue', long: 'Jueves' },
  { id: 'fri', short: 'Vie', long: 'Viernes' },
  { id: 'sat', short: 'Sáb', long: 'Sábado' },
  { id: 'sun', short: 'Dom', long: 'Domingo' },
];
export const DAY_LONG = Object.fromEntries(DAYS.map((d) => [d.id, d.long])) as Record<DayOfWeek, string>;

// Fecha de ese día en la semana actual (lunes a domingo).
export function dayDate(day: DayOfWeek, today = new Date()): Date {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const i = DAYS.findIndex((d) => d.id === day);
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
}

export const isToday = (day: DayOfWeek, today = new Date()) =>
  dayDate(day, today).toDateString() === today.toDateString();

// La rutina se armó otra semana: falta ajustarla con lo que quedó registrado.
export const isFromPastWeek = (generatedAt: string, today = new Date()) =>
  dayDate('mon', new Date(generatedAt)).getTime() !== dayDate('mon', today).getTime();

// dd-mm-aaaa
export const fmtDayDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

// «lunes 2 de noviembre», el lunes de la semana que viene.
export function nextMondayLabel(today = new Date()) {
  const monday = dayDate('mon', today);
  const next = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  return `lunes ${next.getDate()} de ${MONTHS[next.getMonth()]}`;
}

// Semana inicial: lunes, miércoles y viernes de cuerpo completo.
const TRAINING_DAYS: DayOfWeek[] = ['mon', 'wed', 'fri'];

export function defaultDayConfig(day: DayOfWeek): DayConfig {
  return {
    day,
    active: TRAINING_DAYS.includes(day),
    location: 'home',
    availableMinutes: 45,
    gentleStrength: false,
    blocks: {
      warmup: { enabled: true, minutes: 5, exerciseCount: 4 },
      prehab: { enabled: false, exerciseCount: 2 },
      main: { enabled: true, exerciseCount: 4, muscleGroups: ['legs', 'back', 'chest', 'core'] },
      cooldown: { enabled: true, exerciseCount: 4 },
    },
  };
}

export const defaultWeekConfig = (): WeekConfig => ({ days: DAYS.map((d) => defaultDayConfig(d.id)) });

// ---------- Qué hace cada día (partes elegidas) ----------

// Cada día se arma marcando sus partes; sin ninguna es día de descanso.
export type DayPart = 'warmup' | 'prehab' | 'main' | 'cooldown';
export const DAY_PARTS: DayPart[] = ['warmup', 'prehab', 'main', 'cooldown'];
export const DAY_TYPE_PARTS: DayPart[] = ['main', 'prehab', 'cooldown']; // lo que se elige: el calentamiento acompaña
export type DayChoice = DayPart[]; // [] = descanso

const MIN_DAY_MINUTES = 10;
const MIN_STRENGTH_MINUTES = 20;
export const minDayMinutes = (parts: DayChoice) => (parts.includes('main') ? MIN_STRENGTH_MINUTES : MIN_DAY_MINUTES);

// Fuerza siempre lleva calentamiento y elongación; Lesión siempre lleva calentamiento;
// Elongación puede ir sola y el calentamiento nunca va solo.
export const normalizeDayParts = (parts: DayChoice): DayChoice => {
  const main = parts.includes('main');
  const prehab = parts.includes('prehab');
  return DAY_PARTS.filter((p) => {
    if (p === 'warmup') return main || prehab;
    return p === 'cooldown' ? main || parts.includes('cooldown') : parts.includes(p);
  });
};

export const dayIncludedNote = (parts: DayChoice) => {
  if (parts.includes('main')) return 'Calentamiento y Elongación siempre van con Fuerza.';
  if (parts.includes('prehab')) return 'Incluye un calentamiento suave. Elongación es opcional.';
  return parts.length ? 'Sin calentamiento: estira lento y sin forzar.' : null;
};

export const dayPartLabel = (p: DayPart, hasConditions: boolean) =>
  ({
    warmup: 'Calentamiento',
    prehab: hasConditions ? 'Lesión' : 'Movilidad',
    main: 'Fuerza',
    cooldown: 'Elongación',
  })[p];

export const dayChoiceLabel = (parts: DayChoice, hasConditions: boolean) =>
  parts.length ? parts.map((p) => dayPartLabel(p, hasConditions)).join(' + ') : 'Descanso';

// Mismas partes, sin importar el orden.
export const sameChoice = (a: DayChoice, b: DayChoice) => a.length === b.length && a.every((p) => b.includes(p));

// Marca o desmarca una parte; quitar la última deja el día en descanso.
export const toggleDayPart = (parts: DayChoice, p: DayPart): DayChoice => {
  const chosen: DayChoice = parts.filter((x) => x !== 'warmup');
  return normalizeDayParts(chosen.includes(p) ? chosen.filter((x) => x !== p) : [...chosen, p]);
};

// Activa las partes elegidas conservando lo personal del día (lugar, grupos, cantidades).
export function applyDayChoice(cfg: DayConfig, choice: DayChoice): DayConfig {
  const parts = normalizeDayParts(choice);
  if (!parts.length) return { ...cfg, active: false, gentleStrength: false };
  const b = cfg.blocks;
  const has = (p: DayPart) => parts.includes(p);
  return {
    ...cfg,
    active: true,
    availableMinutes: Math.max(cfg.availableMinutes, minDayMinutes(parts)),
    gentleStrength: cfg.gentleStrength && canBeGentle(parts),
    blocks: {
      warmup: { ...b.warmup, enabled: has('warmup') },
      prehab: {
        ...b.prehab,
        enabled: has('prehab'),
        // Día dedicado a la lesión (sin fuerza): más ejercicios para ella, salvo que fijara la cantidad.
        exerciseCount:
          has('prehab') && !has('main') && !b.prehab.fixedCount
            ? Math.max(b.prehab.exerciseCount, 4)
            : b.prehab.exerciseCount,
      },
      main: { ...b.main, enabled: has('main') },
      cooldown: { ...b.cooldown, enabled: has('cooldown') },
    },
  };
}

// Vuelve a dejar que la app decida la cantidad de ejercicios según los minutos.
export const withAutoCounts = (cfg: DayConfig): DayConfig => ({
  ...cfg,
  blocks: {
    warmup: { ...cfg.blocks.warmup, fixedCount: undefined },
    prehab: { ...cfg.blocks.prehab, fixedCount: undefined },
    main: { ...cfg.blocks.main, fixedCount: undefined },
    cooldown: { ...cfg.blocks.cooldown, fixedCount: undefined },
  },
});

export const withGentleStrength = (cfg: DayConfig): DayConfig => ({
  ...applyDayChoice(cfg, [...dayChoiceOf(cfg), 'main']),
  gentleStrength: true,
});

export function dayChoiceOf(cfg: DayConfig): DayChoice {
  if (!cfg.active) return [];
  return DAY_PARTS.filter((p) => cfg.blocks[p].enabled);
}

// Días guardados antes de la regla de partes. El que tenía solo calentamiento pasa a Elongación.
export function normalizeDay(cfg: DayConfig): DayConfig {
  const parts = dayChoiceOf(cfg);
  const fixed = normalizeDayParts(parts);
  const next: DayChoice = fixed.length || !parts.length ? fixed : ['cooldown'];
  const valid = sameChoice(parts, next) && cfg.availableMinutes >= minDayMinutes(next);
  return valid ? cfg : applyDayChoice(cfg, next);
}

// Días de entrenamiento repartidos en la semana según cuántos quiere entrenar.
const SPREAD: Record<number, DayOfWeek[]> = {
  1: ['wed'],
  2: ['mon', 'thu'],
  3: ['mon', 'wed', 'fri'],
  4: ['mon', 'tue', 'thu', 'fri'],
  5: ['mon', 'tue', 'wed', 'fri', 'sat'],
  6: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  7: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
};

const STRENGTH_DAY: DayChoice = ['warmup', 'main', 'cooldown'];
// La fuerza es la prioridad: los días de lesión también llevan fuerza, pero suave.
const INJURY_DAY: DayChoice = ['warmup', 'prehab', 'main', 'cooldown'];
export const GENTLE_MAX = 2; // ejercicios de fuerza en un día de fuerza suave

// Siempre queda al menos un día sin Fuerza (ni siquiera suave): es cuando el cuerpo asimila el trabajo.
// Ese día se puede calentar, cuidar una lesión o elongar.
export const REST_FROM_STRENGTH_NOTE =
  'Deja al menos un día sin Fuerza: es cuando el cuerpo asimila el trabajo. Ese día puedes hacer movilidad, cuidar una lesión o elongar.';
// ¿Los otros días ya ocupan todos los días de Fuerza permitidos? (`day` es el que se está editando.)
export const strengthDaysFull = (choices: Partial<Record<DayOfWeek, DayChoice>>, day: DayOfWeek) =>
  Object.entries(choices).filter(([d, parts]) => d !== day && parts?.includes('main')).length >= MAX_STRENGTH_DAYS;
export const weekChoicesOf = (week: WeekConfig) =>
  Object.fromEntries(week.days.map((d) => [d.day, dayChoiceOf(d)])) as Record<DayOfWeek, DayChoice>;

// Propuesta de semana: con una lesión y 4+ días, alterna fuerza con días de
// lesión (que llevan fuerza suave); con pocos días, todas las partes con fuerza completa.
export function proposeWeek(
  daysPerWeek: number,
  hasConditions: boolean,
): { choices: Record<DayOfWeek, DayChoice>; gentle: DayOfWeek[] } {
  const training = SPREAD[Math.min(7, Math.max(1, daysPerWeek))];
  const choices = Object.fromEntries(DAYS.map((d) => [d.id, [] as DayChoice])) as Record<DayOfWeek, DayChoice>;
  const gentle: DayOfWeek[] = [];
  training.forEach((day, i) => {
    // El séptimo día nunca lleva Fuerza: lesión y elongación, o solo elongación.
    if (i >= MAX_STRENGTH_DAYS) choices[day] = hasConditions ? ['prehab', 'cooldown'] : ['cooldown'];
    else if (!hasConditions) choices[day] = STRENGTH_DAY;
    else if (training.length < 4) choices[day] = DAY_PARTS;
    else if (i % 2 === 0) choices[day] = STRENGTH_DAY;
    else {
      choices[day] = INJURY_DAY;
      gentle.push(day);
    }
  });
  return { choices, gentle };
}

// La fuerza suave solo tiene sentido en un día con Lesión y Fuerza.
export const canBeGentle = (parts: DayChoice) => parts.includes('prehab') && parts.includes('main');

// Huella de lo que influye en la rutina; si cambia, el plan quedó desactualizado.
const hashOf = (value: unknown) => {
  const s = JSON.stringify(value);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export const configHash = (week: WeekConfig, profileUpdatedAt: string) => hashOf({ week, profileUpdatedAt });
// La zona del día (tren inferior, superior...) depende de cuántos días de Fuerza tiene la semana:
// si eso cambia, la rutina del día ya no corresponde. En cuerpo completo la huella es la de siempre.
export const dayConfigHash = (cfg: DayConfig, profileUpdatedAt: string, week?: WeekConfig) => {
  const zone = week ? weekFocus(week.days)[cfg.day] : undefined;
  return zone && zone.focus !== 'full' ? hashOf({ cfg, profileUpdatedAt, zone }) : hashOf({ cfg, profileUpdatedAt });
};

export const dayHashes = (week: WeekConfig, profileUpdatedAt: string) =>
  Object.fromEntries(week.days.map((d) => [d.day, dayConfigHash(d, profileUpdatedAt, week)])) as Record<
    DayOfWeek,
    string
  >;

// Días cuya rutina ya no corresponde a su configuración (o que aún no tienen rutina).
// Los planes antiguos sin huella por día se comparan con la huella de toda la semana.
export function staleDays(
  plan: { configHash: string; dayHashes?: Partial<Record<DayOfWeek, string>>; days: { day: DayOfWeek }[] },
  week: WeekConfig,
  profileUpdatedAt: string,
): Set<DayOfWeek> {
  const active = week.days.filter((d) => d.active);
  if (!plan.dayHashes) {
    return new Set(plan.configHash === configHash(week, profileUpdatedAt) ? [] : active.map((d) => d.day));
  }
  return new Set(
    active
      .filter(
        (d) =>
          !plan.days.some((p) => p.day === d.day) ||
          plan.dayHashes![d.day] !== dayConfigHash(d, profileUpdatedAt, week),
      )
      .map((d) => d.day),
  );
}
