import type { EquipmentId, MuscleGroupId, MuscleId, RestrictionFlagId } from '@/domain/catalog';
import { type BlockType, type Exercise, ExerciseSchema } from '@/domain/schema';
import { GYMVISUAL_VIDEO_IDS } from './mediaSources';

// Forma compacta para escribir el seed a mano. `buildExercise` la expande
// al modelo completo `Exercise` y la valida con zod.
export type ExerciseInput = {
  id: string;
  name: string;
  description: string;
  blocks: BlockType[];
  groups: MuscleGroupId[];
  pattern: Exercise['movementPattern'];
  mechanics: Exercise['mechanics'];
  laterality?: Exercise['laterality'];
  level: number;
  impact?: Exercise['impactLevel'];
  flags?: RestrictionFlagId[];
  required?: EquipmentId[];
  optional?: EquipmentId[];
  primary: [MuscleId, number][];
  secondary?: [MuscleId, number][];
  rx: { sets: number; reps?: [number, number]; sec?: number; rest: number; tempo?: string };
  chain?: [string, number];
  next?: string[];
  previous?: string[];
  steps: string[];
  cues?: string[];
  mistakes?: string[];
  breathing?: string;
  kb?: {
    grip: NonNullable<Exercise['kettlebellGuide']>['grip'];
    start: string;
    hinge?: string[];
    drill?: string;
    lumbar: string[];
    weights: [number, number, number];
    prereq?: string[];
  };
  safety?: Partial<Record<RestrictionFlagId, string>>;
  stretches?: string[];
  tags?: string[];
};

const t = (es: string) => ({ es });
const activation = ([muscle, intensity]: [MuscleId, number]) => ({ muscle, intensity });

export function buildExercise(d: ExerciseInput): Exercise {
  const base = `exercises/${d.id}`;
  return ExerciseSchema.parse({
    id: d.id,
    version: 1,
    name: t(d.name),
    description: t(d.description),
    blockTypes: d.blocks,
    muscleGroups: d.groups,
    movementPattern: d.pattern,
    mechanics: d.mechanics,
    laterality: d.laterality ?? 'bilateral',
    complexityLevel: d.level,
    impactLevel: d.impact ?? (d.mechanics === 'stretch' ? 'none' : 'low'),
    restrictionFlags: d.flags ?? [],
    equipment: { required: d.required ?? [], optional: d.optional ?? [] },
    anatomy: { primary: d.primary.map(activation), secondary: (d.secondary ?? []).map(activation) },
    prescription: {
      mode: d.rx.sec ? 'time' : 'reps',
      sets: d.rx.sets,
      repRange: d.rx.reps ? { min: d.rx.reps[0], max: d.rx.reps[1] } : null,
      durationSec: d.rx.sec ?? null,
      restSec: d.rx.rest,
      tempo: d.rx.tempo ?? null,
    },
    progression: {
      chainId: d.chain?.[0] ?? null,
      step: d.chain?.[1] ?? null,
      next: d.next ?? [],
      previous: d.previous ?? [],
    },
    media: {
      status: 'placeholder',
      thumbnail: `${base}/thumb.webp`,
      animation: GYMVISUAL_VIDEO_IDS[d.id]
        ? { type: 'mp4', src: `videos/${GYMVISUAL_VIDEO_IDS[d.id]}.mp4`, loop: true }
        : { type: 'lottie', src: `${base}/anim.json`, loop: true },
      stepFrames: d.steps.map((_, i) => `${base}/step_${i + 1}.webp`),
      provider: GYMVISUAL_VIDEO_IDS[d.id]
        ? { name: 'gymvisual', id: GYMVISUAL_VIDEO_IDS[d.id], style: 'basic_grey' }
        : null,
    },
    instructions: {
      steps: d.steps.map((s, i) => ({ order: i + 1, text: t(s), frame: i })),
      keyCues: (d.cues ?? []).map(t),
      commonMistakes: (d.mistakes ?? []).map(t),
      breathing: d.breathing ? t(d.breathing) : null,
    },
    kettlebellGuide: d.kb
      ? {
          grip: d.kb.grip,
          startPosition: t(d.kb.start),
          hipHinge: d.kb.hinge ? { cues: d.kb.hinge.map(t), drillExerciseId: d.kb.drill ?? null } : null,
          lumbarSafety: d.kb.lumbar.map(t),
          suggestedWeightKg: { beginner: d.kb.weights[0], intermediate: d.kb.weights[1], advanced: d.kb.weights[2] },
          prerequisites: d.kb.prereq ?? [],
        }
      : null,
    safetyNotes: Object.entries(d.safety ?? {}).map(([flag, note]) => ({ flag, note: t(note as string) })),
    cooldownStretchIds: d.stretches ?? [],
    tags: d.tags ?? [],
  });
}
