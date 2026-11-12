import { type DayFocus, FOCUS_LABEL } from '@/domain/strength';
import type { DayConfig, DayPlan } from '@/domain/schema';
import { weightLabel, workLabel } from '@/domain/sides';

// Lo elegido para el día: lo que va incluido siempre no se repite.
// `focus`: la zona del día cuando la Fuerza de la semana va dividida (tren inferior, superior...).
export function dayTypeLabel(d: DayConfig, hasConditions: boolean, focus?: DayFocus): string {
  if (!d.active) return 'Descanso';
  const b = d.blocks;
  const parts: string[] = [];
  if (b.main.enabled) {
    parts.push(
      d.gentleStrength ? 'Fuerza suave' : focus && focus !== 'full' ? `Fuerza · ${FOCUS_LABEL[focus]}` : 'Fuerza',
    );
  }
  if (b.prehab.enabled) parts.push(hasConditions ? 'Lesión' : 'Movilidad');
  if (b.cooldown.enabled && !b.main.enabled) parts.push('Elongación');
  return parts.join(' + ') || 'Sin partes';
}

export const describeDayConfig = (d: DayConfig, hasConditions: boolean, focus?: DayFocus) =>
  `${dayTypeLabel(d, hasConditions, focus)} · ${d.availableMinutes} min`;

export const countExercises = (d: DayPlan) => d.blocks.reduce((n, b) => n + b.slots.length, 0);

export const slotLabel = (s: {
  exerciseId: string;
  sets: number;
  reps: number | null;
  durationSec: number | null;
  weightKg: number | null;
}) => {
  const weight = s.weightKg ? ` · ${weightLabel(s.exerciseId, s.weightKg)}` : '';
  return `${s.sets} × ${workLabel(s.exerciseId, s.reps, s.durationSec)}${weight}`;
};
