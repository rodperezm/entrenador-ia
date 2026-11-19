import type { WorkoutSession } from './schema';

// Desbalance entre lados en ejercicios a un lado (por ejemplo, el brazo izquierdo con menos fuerza).
// Solo existe si la persona lo marca al terminar el ejercicio. Mientras esté vigente, la carga no sube
// y se le sugiere empezar por el lado débil. Se apaga solo:
// - cuando marca «Iguales» en EVEN_TO_CLEAR sesiones seguidas de ese ejercicio, o
// - cuando hace el ejercicio QUIET_TO_CLEAR veces seguidas sin marcar nada.

export type WeakSide = 'left' | 'right';
export const EVEN_TO_CLEAR = 2;
export const QUIET_TO_CLEAR = 3;

export const WEAK_SIDE_LABEL: Record<WeakSide, string> = { left: 'izquierdo', right: 'derecho' };
const OTHER: Record<WeakSide, WeakSide> = { left: 'right', right: 'left' };

/** Lado débil vigente de un ejercicio, según el historial (de la sesión más reciente a la más antigua). */
export function weakSideOf(exerciseId: string, history: WorkoutSession[]): WeakSide | null {
  let even = 0;
  let quiet = 0;
  for (const s of history) {
    const logs = s.sets.filter((l) => l.exerciseId === exerciseId && !l.format);
    if (!logs.length) continue;
    const mark = logs.flatMap((l) => (l.weakSide ? [l.weakSide] : [])).at(-1);
    if (!mark) {
      if (++quiet >= QUIET_TO_CLEAR) return null;
      continue;
    }
    if (mark === 'even') {
      if (++even >= EVEN_TO_CLEAR) return null;
      continue;
    }
    return mark;
  }
  return null;
}

/** Consejo para la sesión: empezar por el lado débil y no pasarse con el fuerte. */
export const weakSideCue = (side: WeakSide) =>
  `Empieza por tu lado ${WEAK_SIDE_LABEL[side]} y haz las mismas repeticiones con el ${WEAK_SIDE_LABEL[OTHER[side]]}.`;
