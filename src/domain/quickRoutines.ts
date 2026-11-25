import type { Exercise } from './schema';

// Rutinas rápidas: secuencias cortas y fijas para estirar o soltar una zona, fuera del plan de la
// semana. No las arma la IA ni se registran en el historial: no cuentan para el ciclo ni para las
// cargas. Cada lista está elegida a mano del catálogo y solo usa peso corporal (a lo más, una
// colchoneta), para que sirvan en casa o en el parque.

export type RoutineTone = 'accent' | 'blue' | 'green' | 'amber' | 'violet' | 'teal' | 'lime' | 'rose' | 'orange' | 'gold';

export type QuickRoutine = {
  id: string;
  title: string;
  zone: string; // qué partes del cuerpo cubre
  when: string; // cuándo conviene
  tone: RoutineTone;
  exerciseIds: string[];
  caution?: string;
  intro?: string; // reemplaza la indicación de estirar en las rutinas que no son de estiramiento
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
  {
    id: 'posture',
    title: 'Mejora tu postura',
    zone: 'Pecho, hombros y espalda alta',
    when: 'Para enderezar la espalda encorvada',
    tone: 'teal',
    exerciseIds: ['stretch_chest_wall', 'stretch_thoracic_towel', 'wall_angel', 'prone_ytw', 'chin_tuck'],
  },
  {
    // Fuerza, no estiramiento: lo que mejor respaldan los estudios para el codo de tenista es cargar
    // los extensores de muñeca (sobre todo al bajar lento), con el hombro y la escápula como apoyo.
    id: 'elbow',
    title: 'Prevenir el codo de tenista',
    zone: 'Antebrazo, codo y hombro',
    when: 'Fuerza suave, 2 o 3 veces por semana',
    tone: 'rose',
    exerciseIds: [
      'wrist_mobility',
      'wrist_extension_eccentric',
      'side_lying_external_rotation',
      'prone_ytw',
      'stretch_wrist_extensors',
    ],
    caution:
      'Es para prevenir, no un tratamiento. Una molestia leve es aceptable; dolor fuerte, no. Si el codo duele hace semanas, consulta a un profesional de la salud.',
    intro:
      'Te guiamos ejercicio por ejercicio, con cuenta regresiva y sonido. Baja lento y con control; si no tienes una pesa liviana, usa una botella con agua.',
  },
  {
    // Antes de jugar: pocas cosas y rápidas. No hay un estudio de calentamiento propio del pádel; se
    // sigue lo general (mover, movilidad dinámica y el gesto del deporte) apuntando a lo que más se
    // lesiona: codo, hombro y piernas al moverse de lado.
    id: 'padel_warmup',
    title: 'Activación para el pádel',
    zone: 'Muñeca, hombro y piernas',
    when: 'Antes de jugar, en la cancha',
    tone: 'gold',
    exerciseIds: ['jumping_jacks', 'wrist_mobility', 'arm_circles', 'worlds_greatest_stretch', 'lateral_shuffle'],
    intro:
      'Te guiamos ejercicio por ejercicio, con cuenta regresiva y sonido. Empieza suave y sube el ritmo de a poco: al terminar deberías sentirte caliente, no cansado.',
  },
  {
    // Todo de pie, para hacerlo en la cancha apoyado en la reja. En pádel lo que más se lesiona es el
    // codo, después la rodilla, el hombro y la zona lumbar (Dahmen y otros, BMJ Open SEM 2023).
    id: 'padel',
    title: 'Después de jugar pádel',
    zone: 'Piernas, antebrazos y hombros',
    when: 'Al salir de la cancha, todo de pie',
    tone: 'lime',
    exerciseIds: [
      'stretch_calf_wall',
      'stretch_quad_standing',
      'stretch_hip_flexor_standing',
      'stretch_hamstring_standing',
      'stretch_wrist_extensors',
      'stretch_wrist_flexors',
      'stretch_cross_body_shoulder',
    ],
    caution:
      'Estirar ayuda a soltar el cuerpo, pero no reemplaza la fuerza. Si te duele el codo o el hombro al jugar, consulta a un profesional de la salud.',
  },
  {
    // Activación antes de jugar, en la línea del FIFA 11+: mover, abrir cadera y aductores, fuerza de
    // piernas y cambios de dirección. El programa completo (con nórdicos y saltos) reduce lesiones;
    // esta es su versión corta para la cancha, sin compañero. Rodrigo pidió activaciones de unos 5 min:
    // se dejaron 5 ejercicios, con un solo balanceo (el lateral, por los aductores) y los
    // desplazamientos laterales en vez del equilibrio a una pierna.
    id: 'football',
    title: 'Activación para el fútbol',
    zone: 'Cadera, piernas y cambios de dirección',
    when: 'Antes del partido, en la cancha',
    tone: 'orange',
    exerciseIds: ['jumping_jacks', 'leg_swings_side', 'worlds_greatest_stretch', 'air_squat', 'lateral_shuffle'],
    intro:
      'Te guiamos ejercicio por ejercicio, con cuenta regresiva y sonido. Empieza suave y sube el ritmo de a poco: al terminar deberías sentirte caliente, no cansado.',
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
