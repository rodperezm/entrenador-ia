import type { Exercise } from './schema';

// Rutinas rápidas: secuencias cortas y fijas para estirar o soltar una zona, fuera del plan de la
// semana. No las arma la IA ni se registran en el historial: no cuentan para el ciclo ni para las
// cargas. Cada lista está elegida a mano del catálogo y solo usa peso corporal (a lo más, una
// colchoneta), para que sirvan en casa o en el parque.

export type RoutineTone = 'accent' | 'blue' | 'green' | 'amber' | 'violet';

export type QuickRoutine = {
  id: string;
  title: string;
  zone: string; // qué partes del cuerpo cubre
  when: string; // cuándo conviene
  tone: RoutineTone;
  exerciseIds: string[];
  caution?: string;
};

export const QUICK_ROUTINES: QuickRoutine[] = [
  {
    id: 'full',
    title: 'Estirar todo el cuerpo',
    zone: 'De la cabeza a los pies',
    when: 'Ideal después de entrenar',
    tone: 'accent',
    exerciseIds: [
      'stretch_upper_back',
      'stretch_chest_wall',
      'stretch_child_pose',
      'stretch_hip_flexor_kneeling',
      'stretch_glute_figure4',
      'stretch_hamstring_supine',
    ],
  },
  {
    id: 'upper',
    title: 'Zona alta',
    zone: 'Cuello, hombros y espalda',
    when: 'Para soltar la parte de arriba',
    tone: 'blue',
    exerciseIds: [
      'stretch_neck_lateral',
      'stretch_cross_body_shoulder',
      'stretch_triceps_overhead',
      'stretch_chest_wall',
      'stretch_upper_back',
    ],
  },
  {
    id: 'lower',
    title: 'Zona baja',
    zone: 'Cadera, piernas y tobillos',
    when: 'Para soltar las piernas',
    tone: 'green',
    exerciseIds: [
      'stretch_hip_flexor_standing',
      'stretch_quad_standing',
      'stretch_hamstring_standing',
      'stretch_calf_wall',
      'stretch_glute_figure4',
    ],
  },
  {
    id: 'sitting',
    title: 'Mucho rato sentado',
    zone: 'Cadera y espalda',
    when: 'Después de horas en la silla',
    tone: 'amber',
    exerciseIds: ['chin_tuck', 'cat_cow', 'stretch_open_book', 'stretch_hip_flexor_kneeling', 'stretch_glute_figure4'],
  },
  {
    id: 'knees',
    title: 'Rodillas rígidas',
    zone: 'Movilidad suave de rodilla',
    when: 'Para moverlas sin forzar',
    tone: 'violet',
    exerciseIds: ['stretch_calf_wall', 'stretch_hamstring_supine', 'stretch_quad_standing', 'straight_leg_raise', 'glute_bridge'],
    caution:
      'Es movilidad suave, no un tratamiento. Muévete solo hasta donde no duela; si la rodilla duele, se hincha o se traba, detente y consulta a un profesional de la salud.',
  },
];

export type RoutineStep = {
  exercise: Exercise;
  seconds: number; // tiempo total del paso
  sides: 1 | 2; // 2 = a mitad de camino se cambia de lado
  label: string; // «30 s por lado», «8-10 repeticiones»
};

const PREP_SEC = 5; // tiempo para acomodarse antes de cada paso
const REPS_SEC = 45; // lo que toma, a ritmo tranquilo, una serie por repeticiones

// Un paso por ejercicio, con una sola serie: es una rutina corta, no una sesión.
export function routineSteps(routine: QuickRoutine, byId: Map<string, Exercise>): RoutineStep[] {
  return routine.exerciseIds.flatMap((id) => {
    const exercise = byId.get(id);
    if (!exercise) return [];
    const sides = exercise.laterality === 'bilateral' ? 1 : 2;
    const p = exercise.prescription;
    const perSide = sides === 2 ? ' por lado' : '';
    if (p.mode === 'time' && p.durationSec)
      return [{ exercise, sides, seconds: p.durationSec * sides, label: `${p.durationSec} s${perSide}` }];
    const reps = p.repRange ? `${p.repRange.min}-${p.repRange.max} repeticiones` : 'A ritmo tranquilo';
    return [{ exercise, sides, seconds: REPS_SEC * sides, label: `${reps}${perSide}` }];
  });
}

export const ROUTINE_PREP_SEC = PREP_SEC;
export const routineSeconds = (steps: RoutineStep[]) => steps.reduce((n, s) => n + s.seconds + PREP_SEC, 0);
export const routineMinutes = (steps: RoutineStep[]) => Math.max(1, Math.round(routineSeconds(steps) / 60));
