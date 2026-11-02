import { EXERCISES_BY_ID } from '@/data/exercises.seed';

// Ejercicios a un lado: las repeticiones o el tiempo indicados son para cada lado, y una
// serie incluye ambos. En los alternados, el número indicado es el total de la serie.
export const isPerSide = (exerciseId: string) => EXERCISES_BY_ID.get(exerciseId)?.laterality === 'unilateral';

export function sideLabel(exerciseId: string) {
  const laterality = EXERCISES_BY_ID.get(exerciseId)?.laterality;
  return laterality === 'unilateral' ? 'por lado' : laterality === 'alternating' ? 'alternando' : '';
}

// Con dos kettlebells se registra el peso de cada una.
export const kettlebellCount = (exerciseId: string) => EXERCISES_BY_ID.get(exerciseId)?.kettlebellCount ?? 1;

export const weightLabel = (exerciseId: string, kg: number) =>
  kettlebellCount(exerciseId) === 2 ? `2 × ${kg} kg` : `${kg} kg`;
