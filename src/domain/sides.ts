import { EXERCISES_BY_ID } from '@/data/exercises.seed';

// Ejercicios a un lado: las repeticiones o el tiempo indicados son para cada lado, y una
// serie incluye ambos. En los alternados, el número indicado es el total de la serie.
export const isPerSide = (exerciseId: string) => EXERCISES_BY_ID.get(exerciseId)?.laterality === 'unilateral';

export function sideLabel(exerciseId: string) {
  const laterality = EXERCISES_BY_ID.get(exerciseId)?.laterality;
  return laterality === 'unilateral' ? 'por lado' : laterality === 'alternating' ? 'alternando' : '';
}

// Pesas que se usan a la vez (kettlebells o mancuernas): con dos se registra el peso de cada una.
export function loadCount(exerciseId: string) {
  const e = EXERCISES_BY_ID.get(exerciseId);
  return e?.dumbbellGuide?.count ?? e?.kettlebellCount ?? 1;
}

export const weightLabel = (exerciseId: string, kg: number) =>
  loadCount(exerciseId) === 2 ? `2 × ${kg} kg` : `${kg} kg`;
