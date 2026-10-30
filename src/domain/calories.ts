import type { BlockType, Exercise, PlannedBlock } from './schema';
import { slotSeconds } from './timeBudget';

// Gasto calórico estimado: MET × kg × horas. Es una aproximación para comparar
// sesiones, por eso siempre se muestra como rango.

const BLOCK_MET: Record<BlockType, number> = { warmup: 3, prehab: 3, main_strength: 5.5, cooldown: 2.3 };
const BALLISTIC_MET = 8;
const MARGIN = 0.15;

const slotMet = (block: BlockType, exercise: Exercise | undefined) =>
  block === 'main_strength' && exercise?.restrictionFlags.includes('ballistic') ? BALLISTIC_MET : BLOCK_MET[block];

export function latestWeight(records: { weightKg: number | null }[]) {
  return records.find((r) => r.weightKg != null)?.weightKg ?? null;
}

// MET promedio de la rutina, según cuánto dura cada ejercicio.
export function averageMet(blocks: PlannedBlock[], exercises: ReadonlyMap<string, Exercise>) {
  const slots = blocks.flatMap((b) => b.slots.map((s) => ({ block: b.type, slot: s })));
  const seconds = slots.reduce((t, { slot }) => t + slotSeconds(slot), 0);
  if (!seconds) return 0;
  const weighted = slots.reduce(
    (t, { block, slot }) => t + slotSeconds(slot) * slotMet(block, exercises.get(slot.exerciseId)),
    0,
  );
  return weighted / seconds;
}

const toTens = (n: number) => Math.round(n / 10) * 10;

export function kcalRangeLabel(met: number, weightKg: number, minutes: number) {
  const kcal = (met * weightKg * minutes) / 60;
  return `${toTens(kcal * (1 - MARGIN))}–${toTens(kcal * (1 + MARGIN))} kcal`;
}
