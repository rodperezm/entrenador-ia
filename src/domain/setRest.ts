import type { BlockType, Exercise, ExerciseSlot } from './schema';

// Descanso mínimo entre series fuera de la Fuerza. Muchos ejercicios de calentamiento, movilidad
// y elongación vienen con 1 serie y 0 s de descanso; cuando sobra tiempo se les suma una serie y
// sin este mínimo se pasaba de una a otra sin recuperar el aire (por ejemplo, 2 × 10 sentadillas).
// Es un piso: nunca baja un descanso que ya sea mayor. La Fuerza tiene sus propios mínimos por rol.
export const SET_REST_SEC = {
  demanding: 30, // mueven el cuerpo entero o las piernas con fuerza: sentadilla, zancada, escalador
  light: 20, // cardio suave y activación de un músculo: saltos de tijera, marcha, bandas
  gentle: 10, // movilidad suave y estiramientos: lo justo para respirar y cambiar de posición
} as const;

export function minSetRest(e: Exercise, block: BlockType): number {
  if (block === 'main_strength') return 0;
  if (block === 'cooldown' || e.mechanics === 'mobility' || e.mechanics === 'stretch') return SET_REST_SEC.gentle;
  if (e.mechanics === 'compound') return SET_REST_SEC.demanding;
  return SET_REST_SEC.light;
}

// Descanso que corresponde entre series de un ejercicio en su parte de la sesión.
export const setRestSec = (slot: ExerciseSlot, e: Exercise | null | undefined, block: BlockType) =>
  e ? Math.max(slot.restSec, minSetRest(e, block)) : slot.restSec;

export const withSetRest = (slot: ExerciseSlot, e: Exercise | null | undefined, block: BlockType): ExerciseSlot => {
  const restSec = setRestSec(slot, e, block);
  return restSec === slot.restSec ? slot : { ...slot, restSec };
};
