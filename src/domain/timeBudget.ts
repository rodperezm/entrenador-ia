import type { DayConfig, ExerciseSlot, LocalProfile, PlannedBlock } from './schema';
import { DAY_PARTS, type DayPart, GENTLE_MAX } from './week';

// Reparto del tiempo del día: los minutos mandan y la cantidad de ejercicios es
// una base. La parte protagonista conserva al menos la mitad del tiempo; las de
// apoyo tienen tope. Si hay conflicto, gana el tope sobre la meta del 80%.

type Level = LocalProfile['level'];

const GOOD_USE = 0.8; // desde aquí la sesión aprovecha bien el tiempo
const OVER_LIMIT = 1.2; // sobre esto la sesión ya no cabe razonablemente
const MAIN_TOLERANCE = 1.2; // margen de fuerza si hace falta para llegar al 80%

const MAIN_MAX_MIN: Record<Level, number> = { beginner: 30, intermediate: 45, advanced: 60 };
const GENTLE_MAIN_MAX_MIN = 15;
const LEAD_MAX_MIN = { warmup: 15, prehab: 30, cooldown: Infinity };
const SUPPORT_MAX_MIN: Record<DayPart, number> = {
  warmup: 12,
  prehab: 15,
  main: GENTLE_MAIN_MAX_MIN, // fuerza suave: el protagonista es la lesión
  cooldown: 12,
};
const LEAD_ORDER: DayPart[] = ['main', 'prehab', 'cooldown', 'warmup'];

const MAX_COUNT: Record<DayPart, number> = { warmup: 8, prehab: 6, main: 10, cooldown: 8 };
const MAIN_MAX_SETS: Record<Level, number> = { beginner: 3, intermediate: 4, advanced: 5 };
const GENTLE_MIN_SETS = 2;
const MAX_SETS = { warmup: 2, prehab: 3, cooldown: 3 };
const MAX_HOLD_SEC = { warmup: 45, prehab: 45, cooldown: 60 };
const HOLD_STEP_SEC = 15;

// Duración aproximada de un ejercicio prescrito (unos 4 s por repetición y
// 30 s para cambiar de ejercicio).
export const slotSeconds = (s: ExerciseSlot) => {
  const perSet = s.durationSec ?? (s.reps ? s.reps * 4 : 45);
  return s.sets * perSet + (s.sets - 1) * s.restSec + 30;
};

const slotsSeconds = (slots: ExerciseSlot[]) => slots.reduce((t, s) => t + slotSeconds(s), 0);

export const dayMinutes = (blocks: PlannedBlock[]) =>
  Math.round(blocks.reduce((t, b) => t + slotsSeconds(b.slots), 0) / 60);

export function leadPart(cfg: DayConfig): DayPart | null {
  const enabled = LEAD_ORDER.filter((p) => cfg.blocks[p].enabled);
  if (cfg.gentleStrength && cfg.blocks.prehab.enabled) return 'prehab';
  return enabled[0] ?? null;
}

// Segundos que le tocan a cada parte habilitada del día.
export function partBudgets(cfg: DayConfig, level: Level): Partial<Record<DayPart, number>> {
  const total = cfg.availableMinutes * 60;
  const lead = leadPart(cfg);
  if (!lead) return {};

  const gentle = cfg.gentleStrength && lead === 'main';
  const support = DAY_PARTS.filter((p) => cfg.blocks[p].enabled && p !== lead);
  const supportMax = support.reduce((t, p) => t + SUPPORT_MAX_MIN[p] * 60, 0);
  // Las partes de apoyo comparten el 40% del día, o la mitad si son tres.
  const share = support.length === 3 ? 0.5 : 0.4;
  const leadMaxMin = lead === 'main' ? (gentle ? GENTLE_MAIN_MAX_MIN : MAIN_MAX_MIN[level]) : LEAD_MAX_MIN[lead];
  const leadMax = leadMaxMin * 60;

  let leadSec = Math.min(total - Math.min(supportMax, share * total), leadMax);
  const supportSec = () => Math.min(supportMax, total - leadSec);
  if (lead === 'main' && !gentle && leadSec + supportSec() < GOOD_USE * total) {
    leadSec = Math.min(leadMax * MAIN_TOLERANCE, GOOD_USE * total - supportSec());
  }

  const scale = supportMax > 0 ? supportSec() / supportMax : 0;
  return Object.fromEntries([
    [lead, leadSec],
    ...support.map((p) => [p, SUPPORT_MAX_MIN[p] * 60 * scale] as const),
  ]);
}

export function maxCount(part: DayPart, cfg: DayConfig) {
  const block = cfg.blocks[part];
  const base = part === 'main' && cfg.gentleStrength ? Math.min(block.exerciseCount, GENTLE_MAX) : block.exerciseCount;
  if (block.fixedCount) return base;
  return part === 'main' && cfg.gentleStrength ? GENTLE_MAX : MAX_COUNT[part];
}

// Ajusta una parte a sus minutos. `candidates` va por preferencia: los primeros
// son la base y el resto queda de reserva. Si sobra, quita ejercicios y luego
// vueltas; si falta, sube vueltas, duración y al final agrega ejercicios.
// Con cantidad fija solo se tocan vueltas y duración.
export function fitPart(part: DayPart, candidates: ExerciseSlot[], cfg: DayConfig, level: Level): ExerciseSlot[] {
  const budget = partBudgets(cfg, level)[part] ?? 0;
  const fixed = !!cfg.blocks[part].fixedCount;
  const limit = maxCount(part, cfg);
  const baseCount = Math.min(cfg.blocks[part].exerciseCount, limit);
  const out = candidates.slice(0, baseCount).map((s) => ({ ...s }));
  const reserve = fixed ? [] : candidates.slice(baseCount).map((s) => ({ ...s }));
  const total = () => slotsSeconds(out);

  // Baja vueltas de a una, siempre al ejercicio que tenga más, para que queden parejos.
  const dropSets = (minSets: number) => {
    while (total() > budget) {
      const most = Math.max(...out.map((s) => s.sets));
      if (most <= minSets) return;
      [...out].reverse().find((s) => s.sets === most)!.sets--;
    }
  };

  // Fuerza suave: mejor dos ejercicios con pocas vueltas que uno solo con muchas.
  if (part === 'main' && cfg.gentleStrength) dropSets(GENTLE_MIN_SETS);
  while (!fixed && out.length > 1 && total() > budget) reserve.unshift(out.pop()!);
  dropSets(1);

  const maxSets = part === 'main' ? MAIN_MAX_SETS[level] : MAX_SETS[part];
  const maxHold = part === 'main' ? null : MAX_HOLD_SEC[part];
  // Aplica un cambio a cada ejercicio si cabe; responde si logró alguno.
  const growEach = (canGrow: (s: ExerciseSlot) => boolean, step: (s: ExerciseSlot, sign: 1 | -1) => void) => {
    let grew = false;
    for (const s of out.filter(canGrow)) {
      step(s, 1);
      if (total() > budget) step(s, -1);
      else grew = true;
    }
    return grew;
  };
  const addSet = (s: ExerciseSlot, sign: 1 | -1) => {
    s.sets += sign;
  };
  const addHold = (s: ExerciseSlot, sign: 1 | -1) => {
    s.durationSec = s.durationSec! + sign * HOLD_STEP_SEC;
  };

  let changed = true;
  while (changed) {
    changed = false;
    while (growEach((s) => s.sets < maxSets, addSet)) changed = true;
    while (maxHold && growEach((s) => s.durationSec != null && s.durationSec < maxHold, addHold)) changed = true;
    const next = out.length < limit ? reserve.findIndex((s) => total() + slotSeconds(s) <= budget) : -1;
    if (next >= 0) {
      out.push(...reserve.splice(next, 1));
      changed = true;
    }
  }
  return out;
}

export type TimeStatus = { minutes: number; available: number; state: 'short' | 'ok' | 'over' | 'far_over' };

export function timeStatus(blocks: PlannedBlock[], cfg: DayConfig): TimeStatus {
  const minutes = dayMinutes(blocks);
  const available = cfg.availableMinutes;
  const state =
    minutes > available * OVER_LIMIT
      ? 'far_over'
      : minutes > available
        ? 'over'
        : minutes < available * GOOD_USE
          ? 'short'
          : 'ok';
  return { minutes, available, state };
}
