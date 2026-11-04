import type { EquipmentId, RestrictionFlagId } from './catalog';
import type { BlockType, Exercise, UserProfile } from './schema';

// Peso sobre la cabeza o difícil de equilibrar: un exceso puede lesionar, así que no se pasa del sugerido.
const LOAD_LIMITED_IDS = [
  'kb_bottoms_up_press',
  'kb_bottoms_up_carry',
  'kb_overhead_carry',
  'kb_windmill',
  'kb_half_tgu',
  'kb_turkish_get_up',
];

// Mancuernas muy livianas para el nivel no sirven en Fuerza: bajo este porcentaje del
// peso sugerido, se usa la versión con kettlebell.
const DUMBBELL_MIN_RATIO = 0.6;

type WeightProfile = Pick<
  UserProfile,
  'level' | 'kettlebellWeightsKg' | 'kettlebellPairsKg' | 'dumbbellWeightsKg' | 'dumbbellPairsKg'
>;
type Weighted = Pick<Exercise, 'id' | 'kettlebellCount' | 'kettlebellGuide' | 'dumbbellGuide'>;

// Pesos que sirven para un ejercicio: con dos kettlebells o dos mancuernas, solo los que tiene repetidos.
export function weightsFor(e: Weighted, profile: WeightProfile) {
  const db = e.dumbbellGuide;
  if (db) {
    const owned = db.count === 2 ? profile.dumbbellPairsKg : profile.dumbbellWeightsKg;
    return owned.filter((w) => w >= db.suggestedWeightKg[profile.level] * DUMBBELL_MIN_RATIO);
  }
  const owned = e.kettlebellCount === 2 ? profile.kettlebellPairsKg : profile.kettlebellWeightsKg;
  const limit = e.kettlebellGuide?.suggestedWeightKg[profile.level];
  return LOAD_LIMITED_IDS.includes(e.id) && limit != null ? owned.filter((w) => w <= limit) : owned;
}

const needsCheckedWeight = (e: Pick<Exercise, 'id' | 'kettlebellCount' | 'dumbbellGuide'>) =>
  e.kettlebellCount === 2 || LOAD_LIMITED_IDS.includes(e.id) || e.dumbbellGuide != null;

// Si hasta la kettlebell más liviana pasa este múltiplo del peso sugerido para el nivel,
// el ejercicio no se ofrece: mejor otro sin esa carga que empezar con un peso excesivo.
const TOO_HEAVY_RATIO = 1.5;

const tooHeavy = (e: Exercise, profile: WeightProfile) => {
  const limit = e.kettlebellGuide?.suggestedWeightKg[profile.level];
  if (e.dumbbellGuide || limit == null || !e.equipment.required.includes('kettlebell')) return false;
  const owned = weightsFor(e, profile);
  return owned.length > 0 && Math.min(...owned) > limit * TOO_HEAVY_RATIO;
};

// Sin un peso adecuado, el ejercicio no se ofrece.
export const hasUsableWeight = (e: Exercise, profile: WeightProfile) =>
  (!needsCheckedWeight(e) || weightsFor(e, profile).length > 0) && !tooHeavy(e, profile);

// Un peso propuesto por la IA que este ejercicio no admite.
export const isUnsafeWeight = (e: Exercise, profile: WeightProfile, weightKg: number | null) =>
  needsCheckedWeight(e) && !weightsFor(e, profile).includes(weightKg ?? 0);

// Pre-filtro determinista: lo que el LLM nunca debe ver.
// Descarta ejercicios con banderas que el usuario evita, sin el equipamiento
// requerido o excluidos manualmente ("me molesta").
export function filterExercisesForUser(
  exercises: Exercise[],
  profile: Pick<UserProfile, 'equipment' | 'conditions' | 'excludedExerciseIds'> & WeightProfile,
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
      hasUsableWeight(e, profile) &&
      !e.restrictionFlags.some((f) => avoided.has(f)),
  );
}
