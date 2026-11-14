import { EXERCISES_BY_ID } from '@/data/exercises.seed';
import type { StoredWeekPlan } from './schema';

// Ejercicios a un lado: las repeticiones o el tiempo indicados son para cada lado, y una
// serie incluye ambos. En los alternados, el número indicado es el total de la serie
// (8 alternando = 4 con cada brazo), y así se dice en pantalla para que no haya dudas.
export const isPerSide = (exerciseId: string) => EXERCISES_BY_ID.get(exerciseId)?.laterality === 'unilateral';

// Con qué se alterna o se trabaja a un lado: brazo en empujes y tirones, pierna en sentadillas
// y zancadas; si no es claro (core, movilidad, acarreos), «lado».
function limbOf(exerciseId: string): 'brazo' | 'pierna' | null {
  const e = EXERCISES_BY_ID.get(exerciseId);
  if (!e) return null;
  const p = e.movementPattern;
  if (p.startsWith('push_') || p.startsWith('pull_') || p === 'isolation_arm') return 'brazo';
  if (p === 'squat' || p === 'lunge' || /single_leg|pistol/.test(e.id)) return 'pierna';
  return null;
}

const each = (exerciseId: string) => {
  const limb = limbOf(exerciseId);
  return limb ? `con cada ${limb}` : 'por lado';
};

// Lo que acompaña al número: «con cada pierna», «por lado», «en total» o «alternando».
export function sideLabel(exerciseId: string, timed = false) {
  const laterality = EXERCISES_BY_ID.get(exerciseId)?.laterality;
  if (laterality === 'unilateral') return each(exerciseId);
  if (laterality === 'alternating') return timed ? 'alternando' : 'en total';
  return '';
}

// Alternados: cuánto le toca a cada lado («4 con cada brazo»).
export function alternatingSplit(exerciseId: string, reps: number | null) {
  if (EXERCISES_BY_ID.get(exerciseId)?.laterality !== 'alternating' || !reps) return null;
  const a = Math.ceil(reps / 2);
  const b = Math.floor(reps / 2);
  return a === b ? `${a} ${each(exerciseId)}` : `${a} con un lado y ${b} con el otro`;
}

// El trabajo de una serie en una línea: «8 en total (4 con cada brazo)», «8 reps con cada
// pierna», «30 s por lado».
export function workLabel(exerciseId: string, reps: number | null, seconds: number | null) {
  const timed = reps == null;
  const side = sideLabel(exerciseId, timed);
  if (timed) return `${seconds} s${side ? ` ${side}` : ''}`;
  const split = alternatingSplit(exerciseId, reps);
  if (split) return `${reps} en total (${split})`;
  return `${reps} reps${side ? ` ${side}` : ''}`;
}

// Alternados siempre en número par, para repartir igual entre lados. Se redondea hacia arriba
// (bajar dejaría la progresión de +1 repetición siempre en el mismo número), sin pasar del tope.
export function evenAlternatingReps(exerciseId: string, reps: number | null) {
  const e = EXERCISES_BY_ID.get(exerciseId);
  if (e?.laterality !== 'alternating' || reps == null || reps % 2 === 0) return reps;
  const max = e.prescription.repRange?.max ?? Infinity;
  return reps + 1 <= max ? reps + 1 : reps - 1;
}

export const withEvenAlternating = (plan: StoredWeekPlan): StoredWeekPlan => ({
  ...plan,
  days: plan.days.map((d) => ({
    ...d,
    blocks: d.blocks.map((b) => ({
      ...b,
      slots: b.slots.map((s) => ({ ...s, reps: evenAlternatingReps(s.exerciseId, s.reps) })),
    })),
  })),
});

// Pesas que se usan a la vez (kettlebells o mancuernas): con dos se registra el peso de cada una.
export function loadCount(exerciseId: string) {
  const e = EXERCISES_BY_ID.get(exerciseId);
  return e?.dumbbellGuide?.count ?? e?.kettlebellCount ?? 1;
}

export const weightLabel = (exerciseId: string, kg: number) =>
  loadCount(exerciseId) === 2 ? `2 × ${kg} kg` : `${kg} kg`;
