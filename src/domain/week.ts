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

// Semana inicial: lunes, miércoles y viernes de cuerpo completo.
const TRAINING_DAYS: DayOfWeek[] = ['mon', 'wed', 'fri'];

export function defaultDayConfig(day: DayOfWeek): DayConfig {
  return {
    day,
    active: TRAINING_DAYS.includes(day),
    location: 'home',
    availableMinutes: 45,
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
  if (!parts.length) return { ...cfg, active: false };
  const b = cfg.blocks;
  const has = (p: DayPart) => parts.includes(p);
  return {
    ...cfg,
    active: true,
    blocks: {
      warmup: { ...b.warmup, enabled: has('warmup') },
      prehab: {
        enabled: has('prehab'),
        // Día dedicado a la lesión (sin fuerza): más ejercicios para ella.
        exerciseCount: has('prehab') && !has('main') ? Math.max(b.prehab.exerciseCount, 4) : b.prehab.exerciseCount,
      },
      main: { ...b.main, enabled: has('main') },
      cooldown: { ...b.cooldown, enabled: has('cooldown') },
    },
  };
}

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
const INJURY_DAY: DayChoice = ['warmup', 'prehab', 'cooldown'];

// Propuesta de semana: con una lesión y 4+ días, alterna fuerza con días de
// lesión y elongación (fuerza primero); con pocos días, todas las partes.
export function proposeWeek(daysPerWeek: number, hasConditions: boolean): Record<DayOfWeek, DayChoice> {
  const training = SPREAD[Math.min(7, Math.max(1, daysPerWeek))];
  const result = Object.fromEntries(DAYS.map((d) => [d.id, [] as DayChoice])) as Record<DayOfWeek, DayChoice>;
  training.forEach((day, i) => {
    if (!hasConditions) result[day] = STRENGTH_DAY;
    else if (training.length < 4) result[day] = DAY_PARTS;
    else result[day] = i % 2 === 0 ? STRENGTH_DAY : INJURY_DAY;
  });
  return result;
}

// Huella de lo que influye en la rutina; si cambia, el plan quedó desactualizado.
export function configHash(week: WeekConfig, profileUpdatedAt: string): string {
  const s = JSON.stringify({ week, profileUpdatedAt });
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
