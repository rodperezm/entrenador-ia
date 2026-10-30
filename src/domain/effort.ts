import type { Exercise } from './schema';

// Qué pregunta de esfuerzo tiene sentido para cada ejercicio al registrar una serie:
// - reps: fuerza por repeticiones → «¿Cuántas repeticiones más podías hacer?»
// - hold: fuerza por tiempo (planchas, acarreos, isometrías) → «¿Cuánto más podías aguantar?»
// - none: calentamiento, movilidad, equilibrio y elongación → sin pregunta de esfuerzo
// (la de dolor se hace siempre).
export type EffortKind = 'reps' | 'hold' | 'none';

export function effortKind(
  e: Pick<Exercise, 'mechanics' | 'movementPattern' | 'blockTypes' | 'prescription'>,
): EffortKind {
  const onlyWarmupOrCooldown = e.blockTypes.every((b) => b === 'warmup' || b === 'cooldown');
  if (
    e.mechanics === 'stretch' ||
    e.mechanics === 'mobility' ||
    e.movementPattern === 'balance' ||
    onlyWarmupOrCooldown
  )
    return 'none';
  return e.prescription.mode === 'time' ? 'hold' : 'reps';
}

// Las respuestas se guardan como RPE (10 = no podía más) para que la progresión
// y la IA las lean igual.
export const EFFORT_OPTIONS: Record<Exclude<EffortKind, 'none'>, { label: string; rpe: number }[]> = {
  reps: [
    { label: '4 o más', rpe: 6 },
    { label: '3', rpe: 7 },
    { label: '2', rpe: 8 },
    { label: '1', rpe: 9 },
    { label: 'Ninguna', rpe: 10 },
  ],
  hold: [
    { label: 'Bastante (15 s o más)', rpe: 6 },
    { label: 'Un poco (5–10 s)', rpe: 8 },
    { label: 'Justo', rpe: 9 },
    { label: 'No alcancé', rpe: 10 },
  ],
};

export const EFFORT_QUESTION: Record<Exclude<EffortKind, 'none'>, string> = {
  reps: '¿Cuántas repeticiones más podías hacer?',
  hold: '¿Cuánto más podías aguantar?',
};

// Texto corto para la lista de series registradas.
export function effortNote(kind: EffortKind, rpe: number | null): string {
  if (kind === 'none' || rpe == null) return '';
  const opt = EFFORT_OPTIONS[kind].find((o) => o.rpe === rpe);
  if (kind === 'reps') return ` · podía ${(opt?.label ?? String(10 - rpe)).toLowerCase()} más`;
  return ` · aguante: ${(opt?.label ?? '').split(' (')[0].toLowerCase()}`;
}
