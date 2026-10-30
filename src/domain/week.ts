import type { DayConfig, DayOfWeek, WeekConfig } from './schema';

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

// dd-mm-aaaa
export const fmtDayDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

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
export type DayChoice = DayPart[]; // [] = descanso

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
export const toggleDayPart = (parts: DayChoice, p: DayPart): DayChoice =>
  parts.includes(p) ? parts.filter((x) => x !== p) : DAY_PARTS.filter((x) => x === p || parts.includes(x));

// Activa las partes elegidas conservando lo personal del día (lugar, grupos, cantidades).
export function applyDayChoice(cfg: DayConfig, parts: DayChoice): DayConfig {
  if (!parts.length) return { ...cfg, active: false, gentleStrength: false };
  const b = cfg.blocks;
  const has = (p: DayPart) => parts.includes(p);
  return {
    ...cfg,
    active: true,
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
    if (!hasConditions) choices[day] = STRENGTH_DAY;
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
export const dayConfigHash = (cfg: DayConfig, profileUpdatedAt: string) => hashOf({ cfg, profileUpdatedAt });

export const dayHashes = (week: WeekConfig, profileUpdatedAt: string) =>
  Object.fromEntries(week.days.map((d) => [d.day, dayConfigHash(d, profileUpdatedAt)])) as Record<DayOfWeek, string>;

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
        (d) => !plan.days.some((p) => p.day === d.day) || plan.dayHashes![d.day] !== dayConfigHash(d, profileUpdatedAt),
      )
      .map((d) => d.day),
  );
}
