import { equipmentAt, MEDICAL_CONDITIONS, RESTRICTION_FLAGS } from '@/domain/catalog';
import { effortKind, effortNote } from '@/domain/effort';
import { filterExercisesForUser } from '@/domain/filter';
import { strongPainIds } from '@/domain/generator';
import {
  type BlockType,
  type Exercise,
  type LocalProfile,
  painOf,
  type WeekConfig,
  type WorkoutSession,
} from '@/domain/schema';

// Arma el pedido para la Edge Function generate-plan: solo ejercicios ya
// filtrados por restricciones/equipamiento, más perfil, semana e historial.

const BLOCKS: BlockType[] = ['warmup', 'prehab', 'main_strength', 'cooldown'];
const HISTORY_SESSIONS = 8;

export type BodySnapshot = { imc: number | null; ice: number | null; fatPct: number | null; weightKg: number | null };

function ageFrom(birth: string | null) {
  if (!birth) return null;
  const now = new Date();
  let age = now.getFullYear() - Number(birth.slice(0, 4));
  if (now.toISOString().slice(5, 10) < birth.slice(5)) age--;
  return age;
}

export function buildAiRequest(
  week: WeekConfig,
  profile: LocalProfile,
  exercises: Exercise[],
  history: WorkoutSession[],
  body: BodySnapshot | null,
) {
  const forConditions = new Set(
    profile.conditions.flatMap((c) => MEDICAL_CONDITIONS.find((m) => m.id === c.conditionId)?.prehabExerciseIds ?? []),
  );

  // Candidatos: por cada bloque, lo que el usuario puede hacer en ese bloque, en casa o en el
  // parque (cada día dice qué equipamiento tiene disponible).
  // Con dolor fuerte reciente el ejercicio ni siquiera se le ofrece a la IA.
  const anywhere = {
    ...profile,
    equipment: [...new Set([...profile.equipment, ...equipmentAt('park', profile)])],
    excludedExerciseIds: [...profile.excludedExerciseIds, ...strongPainIds(history)],
  };
  const allowed = new Map<string, Set<BlockType>>();
  for (const block of BLOCKS) {
    for (const e of filterExercisesForUser(exercises, anywhere, block)) {
      if (!allowed.has(e.id)) allowed.set(e.id, new Set());
      allowed.get(e.id)!.add(block);
    }
  }
  const candidates = exercises
    .filter((e) => allowed.has(e.id))
    .map((e) => ({
      id: e.id,
      name: e.name.es,
      blocks: [...allowed.get(e.id)!],
      muscleGroups: e.muscleGroups,
      primaryMuscles: e.anatomy.primary.map((m) => m.muscle),
      pattern: e.movementPattern,
      complexity: e.complexityLevel,
      kettlebell: e.equipment.required.includes('kettlebell'),
      equipment: e.equipment.required,
      chain: e.progression.chainId,
      defaults: {
        sets: e.prescription.sets,
        repRange: e.prescription.repRange,
        durationSec: e.prescription.durationSec,
        restSec: e.prescription.restSec,
      },
      suggestedKgByLevel: e.kettlebellGuide?.suggestedWeightKg ?? null,
      cooldownStretchIds: e.cooldownStretchIds,
      forConditions: forConditions.has(e.id),
    }));

  const byId = new Map(exercises.map((e) => [e.id, e]));
  const kindOf = (id: string) => {
    const e = byId.get(id);
    return e ? effortKind(e) : 'reps';
  };

  // Historial: la última vez que hizo cada ejercicio (de las sesiones recientes).
  const seen = new Set<string>();
  const lastByExercise = history.slice(0, HISTORY_SESSIONS).flatMap((s) => {
    const ids = [...new Set(s.sets.map((l) => l.exerciseId))].filter((id) => !seen.has(id));
    ids.forEach((id) => seen.add(id));
    return ids.map((id) => ({
      exerciseId: id,
      date: s.finishedAt.slice(0, 10),
      sets: s.sets
        .filter((l) => l.exerciseId === id)
        .map((l) => ({
          targetReps: l.targetReps,
          repsDone: l.repsDone,
          durationSec: l.durationSec,
          weightKg: l.weightKg,
          rpe: l.rpe,
          // Cómo respondió el usuario (según el tipo de ejercicio), además del RPE.
          effort: effortNote(kindOf(id), l.rpe).replace(' · ', '') || null,
          pain: ['nada', 'leve', 'moderado', 'fuerte'][painOf(l)],
        })),
    }));
  });

  return {
    profile: {
      level: profile.level,
      sex: profile.sex,
      age: ageFrom(profile.birthDate),
      heightCm: profile.heightCm,
      equipment: profile.equipment,
      kettlebellWeightsKg: profile.kettlebellWeightsKg,
      conditions: profile.conditions.map((c) => ({
        name: MEDICAL_CONDITIONS.find((m) => m.id === c.conditionId)?.name ?? c.conditionId,
        avoid: c.activeFlags.map((f) => RESTRICTION_FLAGS[f]),
      })),
    },
    week: week.days
      .filter((d) => d.active)
      .map(({ active: _active, ...d }) => ({ ...d, availableEquipment: equipmentAt(d.location, profile) })),
    candidates,
    history: lastByExercise,
    body,
  };
}
