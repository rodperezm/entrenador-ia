/* eslint-disable @typescript-eslint/no-redeclare -- esquema zod y su tipo comparten nombre a propósito */
import { z } from 'zod';
import { EQUIPMENT_IDS, MUSCLE_GROUPS, MUSCLE_IDS, RESTRICTION_FLAG_IDS } from './catalog';

// ---------- Primitivas ----------

export const LocalizedText = z.object({ es: z.string().min(1), en: z.string().optional() });
export type LocalizedText = z.infer<typeof LocalizedText>;

export const ExerciseId = z.string().regex(/^[a-z0-9_]+$/);
export const MuscleId = z.enum(MUSCLE_IDS);
export const MuscleGroupId = z.enum(MUSCLE_GROUPS);
export const EquipmentId = z.enum(EQUIPMENT_IDS);
export const RestrictionFlagId = z.enum(RESTRICTION_FLAG_IDS);

export const BlockType = z.enum(['warmup', 'prehab', 'main_strength', 'cooldown']);
export type BlockType = z.infer<typeof BlockType>;

export const MovementPattern = z.enum([
  'squat',
  'hinge',
  'lunge',
  'push_horizontal',
  'push_vertical',
  'pull_horizontal',
  'pull_vertical',
  'carry',
  'core_anti_extension',
  'core_anti_rotation',
  'core_flexion',
  'core_rotation',
  'isolation_arm',
  'calf',
  'cardio',
  'mobility',
  'stretch',
  'balance',
]);

export const MuscleActivation = z.object({
  muscle: MuscleId,
  intensity: z.number().min(0).max(1), // 1 = rojo intenso en el heatmap
});
export type MuscleActivation = z.infer<typeof MuscleActivation>;

// ---------- Exercise ----------

export const MediaSchema = z.object({
  status: z.enum(['placeholder', 'ready']),
  thumbnail: z.string(),
  animation: z.object({ type: z.enum(['lottie', 'mp4']), src: z.string(), loop: z.boolean() }),
  stepFrames: z.array(z.string()),
});

export const KettlebellGuide = z.object({
  grip: z.enum(['two_hand_horns', 'two_hand_handle', 'one_hand_handle', 'rack', 'bottoms_up']),
  startPosition: LocalizedText,
  hipHinge: z.object({ cues: z.array(LocalizedText), drillExerciseId: ExerciseId.nullable() }).nullable(),
  lumbarSafety: z.array(LocalizedText).min(1),
  // Peso sugerido para empezar, en kg, por nivel.
  suggestedWeightKg: z.object({ beginner: z.number(), intermediate: z.number(), advanced: z.number() }),
  prerequisites: z.array(ExerciseId),
});
export type KettlebellGuide = z.infer<typeof KettlebellGuide>;

export const ExerciseSchema = z.object({
  id: ExerciseId,
  version: z.number().int().positive(),
  name: LocalizedText,
  description: LocalizedText,

  blockTypes: z.array(BlockType).min(1),
  muscleGroups: z.array(MuscleGroupId),
  movementPattern: MovementPattern,
  mechanics: z.enum(['compound', 'isolation', 'mobility', 'stretch', 'cardio']),
  laterality: z.enum(['bilateral', 'unilateral', 'alternating']),
  complexityLevel: z.number().int().min(1).max(5),
  impactLevel: z.enum(['none', 'low', 'high']),
  restrictionFlags: z.array(RestrictionFlagId),

  equipment: z.object({ required: z.array(EquipmentId), optional: z.array(EquipmentId) }),

  anatomy: z.object({
    primary: z.array(MuscleActivation).min(1),
    secondary: z.array(MuscleActivation),
  }),

  prescription: z.object({
    mode: z.enum(['reps', 'time']),
    sets: z.number().int().positive(),
    repRange: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
    durationSec: z.number().int().positive().nullable(),
    restSec: z.number().int().nonnegative(),
    tempo: z.string().nullable(),
  }),

  // Cadena de progresión: kb_deadlift → kb_swing_2h → kb_swing_1h → kb_clean
  progression: z.object({
    chainId: z.string().nullable(),
    step: z.number().int().nullable(),
    next: z.array(ExerciseId),
    previous: z.array(ExerciseId),
  }),

  media: MediaSchema,

  instructions: z.object({
    steps: z
      .array(z.object({ order: z.number().int(), text: LocalizedText, frame: z.number().int().nullable() }))
      .min(1),
    keyCues: z.array(LocalizedText),
    commonMistakes: z.array(LocalizedText),
    breathing: LocalizedText.nullable(),
  }),

  kettlebellGuide: KettlebellGuide.nullable(),
  safetyNotes: z.array(z.object({ flag: RestrictionFlagId, note: LocalizedText })),
  cooldownStretchIds: z.array(ExerciseId),
  tags: z.array(z.string()),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

// ---------- Usuario ----------

export const UserCondition = z.object({
  conditionId: z.string(),
  activeFlags: z.array(RestrictionFlagId),
  notes: z.string().nullable(),
});

export const Sex = z.enum(['male', 'female']);
export type Sex = z.infer<typeof Sex>;

export const UserProfile = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  // Datos corporales (bitácora "Cuerpo"). Opcionales para no invalidar
  // perfiles guardados antes de existir estos campos.
  sex: Sex.nullable().default(null),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  heightCm: z.number().min(100).max(250).nullable().default(null),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  equipment: z.array(EquipmentId),
  kettlebellWeightsKg: z.array(z.number().positive()),
  conditions: z.array(UserCondition),
  excludedExerciseIds: z.array(ExerciseId),
});
export type UserProfile = z.infer<typeof UserProfile>;

// Perfil guardado en el teléfono mientras no hay cuenta en Supabase.
// Al crear la cuenta se sube y recibe su `id`.
export const LocalProfile = UserProfile.omit({ id: true }).extend({
  disclaimerAcceptedAt: z.string(),
  updatedAt: z.string(),
});
export type LocalProfile = z.infer<typeof LocalProfile>;

// ---------- Plan semanal ----------

export const DayOfWeek = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export type DayOfWeek = z.infer<typeof DayOfWeek>;

// Lo que el usuario configura para un día en el planner.
export const DayConfig = z.object({
  day: DayOfWeek,
  active: z.boolean(), // false = día de descanso
  location: z.enum(['home', 'park']),
  availableMinutes: z.number().int().min(10).max(120).default(45), // tiempo que tiene ese día
  blocks: z.object({
    warmup: z.object({
      enabled: z.boolean(),
      minutes: z.number().int().min(5).max(15),
      exerciseCount: z.number().int().min(1).max(8).default(4),
    }),
    prehab: z.object({ enabled: z.boolean(), exerciseCount: z.number().int().min(1).max(6) }),
    main: z.object({
      enabled: z.boolean(),
      exerciseCount: z.number().int().min(1).max(10),
      muscleGroups: z.array(MuscleGroupId),
    }),
    cooldown: z.object({ enabled: z.boolean(), exerciseCount: z.number().int().min(1).max(8).default(4) }),
  }),
});
export type DayConfig = z.infer<typeof DayConfig>;

export const WeekConfig = z.object({ days: z.array(DayConfig).length(7) });
export type WeekConfig = z.infer<typeof WeekConfig>;

export const ExerciseSlot = z.object({
  exerciseId: ExerciseId,
  sets: z.number().int().positive(),
  reps: z.number().int().positive().nullable(),
  durationSec: z.number().int().positive().nullable(),
  weightKg: z.number().positive().nullable(),
  restSec: z.number().int().nonnegative(),
  rationale: z.string().nullable(), // explicación del LLM ("subimos a 16 kg porque...")
});

export type ExerciseSlot = z.infer<typeof ExerciseSlot>;

export const PlannedBlock = z.object({ type: BlockType, slots: z.array(ExerciseSlot) });
export type PlannedBlock = z.infer<typeof PlannedBlock>;

export const DayPlan = z.object({ day: DayOfWeek, location: z.enum(['home', 'park']), blocks: z.array(PlannedBlock) });
export type DayPlan = z.infer<typeof DayPlan>;

// Salida estructurada que debe devolver el LLM (validada antes de guardar).
export const GeneratedWeekPlan = z.object({ days: z.array(DayPlan), summary: z.string() });
export type GeneratedWeekPlan = z.infer<typeof GeneratedWeekPlan>;

// Plan guardado: incluye con qué se generó y la configuración usada,
// para saber si quedó desactualizado al cambiar la semana o el perfil.
export const StoredWeekPlan = GeneratedWeekPlan.extend({
  generatedAt: z.string(),
  generator: z.enum(['rules', 'llm']),
  configHash: z.string(),
  // Huella de la configuración de cada día al armar su rutina (permite rehacer un solo día).
  dayHashes: z.partialRecord(DayOfWeek, z.string()).optional(),
});
export type StoredWeekPlan = z.infer<typeof StoredWeekPlan>;

// ---------- Historial ----------

export const SetLog = z.object({
  exerciseId: ExerciseId,
  setNo: z.number().int().positive(),
  targetReps: z.number().int().positive().nullable(), // lo planificado, para decidir la progresión
  repsDone: z.number().int().nonnegative().nullable(),
  durationSec: z.number().int().nonnegative().nullable(),
  weightKg: z.number().nonnegative().nullable(),
  rpe: z.number().min(1).max(10).nullable(), // esfuerzo percibido (10 = no podía más)
  painFlag: z.boolean(),
});
export type SetLog = z.infer<typeof SetLog>;

export const WorkoutSession = z.object({
  id: z.string(),
  day: DayOfWeek,
  location: z.enum(['home', 'park']),
  startedAt: z.string(),
  finishedAt: z.string(),
  completed: z.boolean(), // false si se terminó antes de tiempo
  sets: z.array(SetLog),
});
export type WorkoutSession = z.infer<typeof WorkoutSession>;
