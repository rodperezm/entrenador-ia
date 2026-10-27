import { MUSCLE_GROUP_LABELS } from '@/domain/catalog';
import type { DayConfig, DayPlan } from '@/domain/schema';

export function describeDayConfig(d: DayConfig): string {
  if (!d.active) return 'Descanso';
  const b = d.blocks;
  const parts: string[] = [];
  if (b.warmup.enabled) parts.push(`Calentamiento ${b.warmup.minutes}'`);
  if (b.prehab.enabled) parts.push(`Prehab ${b.prehab.exerciseCount}`);
  if (b.main.enabled)
    parts.push(`Fuerza ${b.main.exerciseCount}: ${b.main.muscleGroups.map((g) => MUSCLE_GROUP_LABELS[g]).join(', ')}`);
  if (b.cooldown.enabled) parts.push('Elongación');
  return parts.join(' · ') || 'Sin bloques';
}

export const countExercises = (d: DayPlan) => d.blocks.reduce((n, b) => n + b.slots.length, 0);

export const slotLabel = (s: {
  sets: number;
  reps: number | null;
  durationSec: number | null;
  weightKg: number | null;
}) => `${s.sets} × ${s.reps ?? `${s.durationSec}s`}${s.weightKg ? ` · ${s.weightKg} kg` : ''}`;
