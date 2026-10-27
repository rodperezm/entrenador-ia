import type { EquipmentId, RestrictionFlagId } from './catalog';
import type { BlockType, Exercise, UserProfile } from './schema';

// Pre-filtro determinista: lo que el LLM nunca debe ver.
// Descarta ejercicios con banderas que el usuario evita, sin el equipamiento
// requerido o excluidos manualmente ("me molesta").
export function filterExercisesForUser(
  exercises: Exercise[],
  profile: Pick<UserProfile, 'equipment' | 'conditions' | 'excludedExerciseIds'>,
  block?: BlockType,
): Exercise[] {
  const avoided = new Set<RestrictionFlagId>(profile.conditions.flatMap((c) => c.activeFlags));
  const owned = new Set<EquipmentId>(profile.equipment);
  const excluded = new Set(profile.excludedExerciseIds);

  return exercises.filter(
    (e) =>
      (!block || e.blockTypes.includes(block)) &&
      !excluded.has(e.id) &&
      e.equipment.required.every((eq) => owned.has(eq)) &&
      !e.restrictionFlags.some((f) => avoided.has(f)),
  );
}
