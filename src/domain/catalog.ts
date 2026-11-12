// Catálogos cerrados: grupos musculares, músculos, equipamiento,
// banderas de restricción y condiciones médicas.
// Los IDs de músculo coinciden con las regiones del mapa corporal SVG.

export const MUSCLE_GROUPS = ['legs', 'chest', 'back', 'shoulders', 'arms', 'core'] as const;
export type MuscleGroupId = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroupId, string> = {
  legs: 'Piernas',
  chest: 'Pecho',
  back: 'Espalda',
  shoulders: 'Hombros',
  arms: 'Brazos',
  core: 'Core',
};

export const MUSCLES = {
  quadriceps: { label: 'Cuádriceps', group: 'legs' },
  hamstrings: { label: 'Isquiotibiales', group: 'legs' },
  gluteus_maximus: { label: 'Glúteo mayor', group: 'legs' },
  gluteus_medius: { label: 'Glúteo medio', group: 'legs' },
  adductors: { label: 'Aductores', group: 'legs' },
  hip_flexors: { label: 'Flexores de cadera', group: 'legs' },
  calves: { label: 'Gemelos', group: 'legs' },
  pectoralis_major: { label: 'Pectoral mayor', group: 'chest' },
  latissimus_dorsi: { label: 'Dorsal ancho', group: 'back' },
  trapezius: { label: 'Trapecio', group: 'back' },
  rhomboids: { label: 'Romboides', group: 'back' },
  deltoid_anterior: { label: 'Deltoides anterior', group: 'shoulders' },
  deltoid_lateral: { label: 'Deltoides lateral', group: 'shoulders' },
  deltoid_posterior: { label: 'Deltoides posterior', group: 'shoulders' },
  biceps: { label: 'Bíceps', group: 'arms' },
  triceps: { label: 'Tríceps', group: 'arms' },
  forearms: { label: 'Antebrazos', group: 'arms' },
  rectus_abdominis: { label: 'Recto abdominal', group: 'core' },
  obliques: { label: 'Oblicuos', group: 'core' },
  erector_spinae: { label: 'Lumbares (erectores)', group: 'core' },
} as const satisfies Record<string, { label: string; group: MuscleGroupId }>;
export type MuscleId = keyof typeof MUSCLES;
export const MUSCLE_IDS = Object.keys(MUSCLES) as [MuscleId, ...MuscleId[]];

export const EQUIPMENT = {
  mat: 'Mat / colchoneta',
  kettlebell: 'Kettlebell',
  chair: 'Silla firme',
  bench: 'Banca firme o escalón',
  dumbbells: 'Mancuernas',
  pullup_bar: 'Barra de dominadas',
  parallel_bars: 'Barras paralelas',
  resistance_band: 'Banda elástica',
  activation_bar: 'Barra de activación (palo de escoba, pica o barra de yoga)',
} as const;
export type EquipmentId = keyof typeof EQUIPMENT;
export const EQUIPMENT_IDS = Object.keys(EQUIPMENT) as [EquipmentId, ...EquipmentId[]];

// Lo que el usuario lleva consigo: sirve en casa y en el parque.
export const PORTABLE_EQUIPMENT: EquipmentId[] = [
  'mat',
  'kettlebell',
  'dumbbells',
  'resistance_band',
  'activation_bar',
];
// Lo que puede haber fijo en un parque (el usuario marca qué hay en el suyo).
export const PARK_EQUIPMENT: Partial<Record<EquipmentId, string>> = {
  pullup_bar: 'Barra de dominadas',
  parallel_bars: 'Barras paralelas',
  bench: 'Banca',
};
export const PARK_EQUIPMENT_IDS = Object.keys(PARK_EQUIPMENT) as EquipmentId[];

// Una banca firme sirve para todo lo que se hace con silla; la silla no reemplaza a la banca
// donde hay que subirse, saltar o apoyar la espalda con carga (puede moverse o volcarse).
export const withImplied = (equipment: EquipmentId[]): EquipmentId[] =>
  equipment.includes('bench') && !equipment.includes('chair') ? [...equipment, 'chair'] : equipment;

// Equipamiento disponible según dónde entrena ese día.
export function equipmentAt(
  location: 'home' | 'park',
  profile: { equipment: EquipmentId[]; parkEquipment: EquipmentId[] },
): EquipmentId[] {
  if (location === 'home') return withImplied(profile.equipment);
  return withImplied([
    ...new Set([...profile.equipment.filter((e) => PORTABLE_EQUIPMENT.includes(e)), ...profile.parkEquipment]),
  ]);
}

// Banderas que describen la exigencia de un ejercicio. El usuario activa las
// que quiere evitar; el filtro descarta los ejercicios que tengan alguna.
// Preguntas de alerta antes de empezar: si alguna aplica, conviene consultar a un médico primero.
export const HEALTH_ALERTS = {
  chest: 'Dolor u opresión en el pecho al hacer esfuerzo',
  dizzy: 'Mareos o desmayos sin explicación',
  heart: 'Una enfermedad del corazón o presión alta sin controlar',
  surgery: 'Una cirugía o lesión importante en los últimos 3 meses',
  doctor: 'Un médico te indicó no hacer ejercicio, o hacerlo solo con supervisión',
} as const;

export const RESTRICTION_FLAGS = {
  jumping: 'Saltos',
  high_impact: 'Alto impacto',
  deep_knee_flexion_loaded: 'Flexión profunda de rodilla con carga',
  kneeling: 'Apoyo sobre rodillas',
  overhead: 'Brazos por encima de la cabeza',
  spinal_flexion_loaded: 'Flexión de columna con carga',
  spinal_rotation_loaded: 'Rotación de columna con carga',
  hip_hinge_loaded: 'Bisagra de cadera con carga',
  ballistic: 'Movimientos balísticos / explosivos',
  wrist_extension_loaded: 'Apoyo con muñecas en extensión',
  grip_loaded: 'Agarre intenso (sostener peso con la mano)',
  deep_hip_flexion: 'Flexión profunda de cadera',
  neck_loaded: 'Carga sobre cuello y trapecios',
} as const;
export type RestrictionFlagId = keyof typeof RESTRICTION_FLAGS;
export const RESTRICTION_FLAG_IDS = Object.keys(RESTRICTION_FLAGS) as [RestrictionFlagId, ...RestrictionFlagId[]];

export type MedicalCondition = {
  id: string;
  name: string;
  suggestedFlags: RestrictionFlagId[];
  prehabExerciseIds: string[];
};

// Catálogo cerrado. Las banderas son solo sugerencias: el usuario decide
// cuáles aplican a su caso.
export const MEDICAL_CONDITIONS: MedicalCondition[] = [
  {
    id: 'patellofemoral_pain',
    name: 'Condromalacia rotuliana / dolor patelofemoral',
    suggestedFlags: ['jumping', 'high_impact', 'deep_knee_flexion_loaded', 'kneeling'],
    prehabExerciseIds: ['glute_bridge', 'clamshell', 'straight_leg_raise', 'single_leg_balance'],
  },
  {
    id: 'low_back_pain',
    name: 'Dolor lumbar',
    suggestedFlags: ['spinal_flexion_loaded', 'spinal_rotation_loaded', 'ballistic', 'hip_hinge_loaded'],
    prehabExerciseIds: ['cat_cow', 'bird_dog', 'dead_bug', 'glute_bridge'],
  },
  {
    id: 'shoulder_impingement',
    name: 'Pinzamiento / dolor de hombro',
    suggestedFlags: ['overhead'],
    prehabExerciseIds: ['wall_slide', 'band_pull_apart', 'bar_supine_shoulder_flexion'],
  },
  {
    id: 'wrist_pain',
    name: 'Dolor de muñeca',
    suggestedFlags: ['wrist_extension_loaded'],
    prehabExerciseIds: ['wrist_mobility', 'wrist_extension_eccentric'],
  },
  {
    id: 'ankle_instability',
    name: 'Inestabilidad de tobillo / esguince recurrente',
    suggestedFlags: ['jumping', 'high_impact'],
    prehabExerciseIds: ['single_leg_balance', 'kb_calf_raise', 'short_foot'],
  },
  {
    id: 'patellar_tendinopathy',
    name: 'Tendinopatía rotuliana (rodilla del saltador)',
    suggestedFlags: ['jumping', 'high_impact', 'deep_knee_flexion_loaded'],
    prehabExerciseIds: ['wall_sit_iso', 'terminal_knee_extension', 'straight_leg_raise', 'glute_bridge'],
  },
  {
    id: 'rotator_cuff',
    name: 'Tendinopatía del manguito rotador',
    suggestedFlags: ['overhead', 'ballistic'],
    prehabExerciseIds: [
      'band_external_rotation',
      'side_lying_external_rotation',
      'prone_ytw',
      'wall_slide',
      'bar_external_rotation',
    ],
  },
  {
    id: 'lateral_epicondylitis',
    name: 'Epicondilitis (codo de tenista)',
    suggestedFlags: ['grip_loaded'],
    prehabExerciseIds: ['wrist_extension_eccentric', 'wrist_mobility'],
  },
  {
    id: 'achilles_tendinopathy',
    name: 'Tendinopatía de Aquiles',
    suggestedFlags: ['jumping', 'high_impact'],
    prehabExerciseIds: ['eccentric_heel_drop', 'single_leg_balance', 'short_foot'],
  },
  {
    id: 'plantar_fasciitis',
    name: 'Fascitis plantar',
    suggestedFlags: ['jumping', 'high_impact'],
    prehabExerciseIds: ['short_foot', 'eccentric_heel_drop'],
  },
  {
    id: 'neck_pain',
    name: 'Dolor cervical (cuello)',
    suggestedFlags: ['overhead', 'neck_loaded'],
    prehabExerciseIds: ['chin_tuck', 'band_pull_apart', 'prone_ytw'],
  },
  {
    id: 'hip_impingement',
    name: 'Pinzamiento de cadera (FAI)',
    suggestedFlags: ['deep_hip_flexion', 'deep_knee_flexion_loaded'],
    prehabExerciseIds: ['side_lying_hip_abduction', 'clamshell', 'glute_bridge', 'monster_walk'],
  },
];
