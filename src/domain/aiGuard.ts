import { equipmentAt } from './catalog';
import { cycleInfo } from './cycle';
import { filterExercisesForUser, isUnsafeWeight } from './filter';
import { generateDayByRules, hadPain, lastWeightOf, pickWeight, prescribe } from './generator';
import { progressSlot, wasTooHard } from './progression';
import type {
  BlockType,
  DayConfig,
  DayPlan,
  Exercise,
  ExerciseSlot,
  GeneratedWeekPlan,
  LocalProfile,
  PlannedBlock,
  WorkoutSession,
} from './schema';
import type { DayPart } from './week';

// Última revisión de lo que entrega la IA. Ella elige, pero aquí se asegura lo que no
// puede quedar a su criterio: ejercicios fijos del bloque y no subir carga cuando no corresponde.

type GuardInput = {
  days: DayConfig[];
  profile: LocalProfile;
  exercises: Exercise[];
  history: WorkoutSession[];
  lockedByDay: Partial<Record<DayConfig['day'], string[]>>;
  mainCandidates: string[]; // lo que la IA pudo elegir en Fuerza
};

const FIXED_KEPT_SUMMARY = 'Mantuvimos tus ejercicios del ciclo y ajustamos las cargas con tu historial.';
const PARTS: [BlockType, DayPart][] = [
  ['warmup', 'warmup'],
  ['prehab', 'prehab'],
  ['main_strength', 'main'],
  ['cooldown', 'cooldown'],
];

const lower = (a: number | null, b: number | null) => (a != null && b != null ? Math.min(a, b) : a);

// Un ejercicio fijo solo puede cambiar si dejó de estar disponible (dolor, etapa o equipamiento).
function changedWithoutReason(day: DayPlan, cfg: DayConfig, input: GuardInput) {
  const fixed = input.lockedByDay[day.day];
  if (!fixed?.length) return false;
  const available = new Set<string>(equipmentAt(cfg.location, input.profile));
  const canStay = (id: string) => {
    const e = input.exercises.find((x) => x.id === id);
    return !!e && input.mainCandidates.includes(id) && e.equipment.required.every((q) => available.has(q));
  };
  const allowedChanges = fixed.filter((id) => !canStay(id)).length;
  const slots = day.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots);
  return slots.filter((s) => !fixed.includes(s.exerciseId)).length > allowedChanges;
}

function limitLoad(proposed: ExerciseSlot, input: GuardInput): ExerciseSlot {
  const { profile, exercises, history } = input;
  const e = exercises.find((x) => x.id === proposed.exerciseId);
  if (!e) return proposed;
  // Con dos kettlebells o carga delicada, el peso debe ser uno que el ejercicio admita.
  const slot = isUnsafeWeight(e, profile, proposed.weightKg)
    ? { ...proposed, weightKg: pickWeight(e, profile) }
    : proposed;
  if (hadPain(e.id, history) || wasTooHard(e.id, history)) {
    const safe = progressSlot(slot, e, profile, history);
    const limited = {
      ...slot,
      reps: lower(slot.reps, safe.reps),
      durationSec: lower(slot.durationSec, safe.durationSec),
      weightKg: lower(slot.weightKg, safe.weightKg),
    };
    const changed =
      limited.reps !== slot.reps || limited.durationSec !== slot.durationSec || limited.weightKg !== slot.weightKg;
    return changed ? { ...limited, rationale: safe.rationale } : slot;
  }
  const { week } = cycleInfo(history, profile.level);
  const noRaise = week === 4 || (week === 3 && profile.level === 'beginner');
  const last = lastWeightOf(e.id, history);
  if (!noRaise || last == null || slot.weightKg == null || slot.weightKg <= last) return slot;
  return {
    ...slot,
    weightKg: last,
    rationale:
      week === 4
        ? 'Semana de descarga: sin subir el peso.'
        : 'Semana de máxima intensidad: mismo peso, prioridad a la técnica.',
  };
}

// Con barra de activación, todo día de fuerza prepara el hombro en el calentamiento, como en
// las reglas. Si la IA no lo puso, reemplaza el último ejercicio del calentamiento para no alargarlo.
function ensureShoulderPrep(blocks: PlannedBlock[], cfg: DayConfig, input: GuardInput): PlannedBlock[] {
  const warmup = blocks.find((b) => b.type === 'warmup');
  const hasMain = blocks.some((b) => b.type === 'main_strength' && b.slots.length > 0);
  if (!warmup?.slots.length || !hasMain) return blocks;
  const byId = new Map(input.exercises.map((e) => [e.id, e]));
  if (warmup.slots.some((s) => byId.get(s.exerciseId)?.tags.includes('shoulder_prep'))) return blocks;
  const dayProfile = { ...input.profile, equipment: equipmentAt(cfg.location, input.profile) };
  const used = new Set(blocks.flatMap((b) => b.slots.map((s) => s.exerciseId)));
  const prep = filterExercisesForUser(input.exercises, dayProfile, 'warmup').find(
    (e) => e.tags.includes('shoulder_prep') && !used.has(e.id),
  );
  if (!prep) return blocks;
  const slots = [prescribe(prep, input.profile, null), ...warmup.slots.slice(0, -1)];
  return blocks.map((b) => (b === warmup ? { ...b, slots } : b));
}

export function guardAiPlan(plan: GeneratedWeekPlan, input: GuardInput): GeneratedWeekPlan {
  const { days, profile, exercises, history, lockedByDay } = input;
  let restored = false;
  const guarded = plan.days.map((day) => {
    const cfg = days.find((d) => d.day === day.day);
    if (!cfg) return day;
    let blocks = day.blocks;
    const others = plan.days.filter((d) => d.day !== day.day);
    const byRules = () => generateDayByRules(cfg, others, profile, exercises, history, 1, lockedByDay[day.day], days);
    if (changedWithoutReason(day, cfg, input)) {
      restored = true;
      const main = byRules().blocks.find((b) => b.type === 'main_strength');
      blocks = main ? blocks.map((b) => (b.type === 'main_strength' ? main : b)) : blocks;
    }
    // Cada día lleva exactamente sus partes: si la IA omitió una, se arma por reglas.
    const wanted = PARTS.filter(([, part]) => cfg.blocks[part].enabled).map(([type]) => type);
    if (wanted.length !== blocks.length || wanted.some((type) => !blocks.some((b) => b.type === type))) {
      const rules = byRules();
      blocks = wanted
        .map((type) => blocks.find((b) => b.type === type) ?? rules.blocks.find((b) => b.type === type))
        .filter((b): b is PlannedBlock => !!b);
    }
    blocks = ensureShoulderPrep(blocks, cfg, input);
    return {
      ...day,
      blocks: blocks.map((b) =>
        b.type === 'main_strength' ? { ...b, slots: b.slots.map((s) => limitLoad(s, input)) } : b,
      ),
    };
  });
  return { ...plan, days: guarded, summary: restored ? FIXED_KEPT_SUMMARY : plan.summary };
}
