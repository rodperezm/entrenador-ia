import { equipmentAt } from './catalog';
import { type CycleInfo, cycleInfo } from './cycle';
import { filterExercisesForUser, isUnsafeWeight } from './filter';
import { generateDayByRules, hadPain, isGentle, lastWeightOf, pickWeight, prescribe } from './generator';
import { feltTooMuch, progressSlot, wasTooHard } from './progression';
import { dayIntensity, MIN_REST_SEC, POWER_REPS_MAX, slotRole, sortByRole } from './strength';
import { fitPart } from './timeBudget';
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
// puede quedar a su criterio: ejercicios fijos del bloque, partes y orden del día, fuerza
// suave, dosis (series, repeticiones y descansos), no subir carga cuando no corresponde y
// que cada parte quepa en sus minutos.

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
  if (hadPain(e.id, history) || wasTooHard(e.id, history) || feltTooMuch(e.id, history)) {
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

// Día de fuerza suave (lesión): solo ejercicios sencillos, sin balísticos ni saltos. Si la IA no
// dejó ninguno que cumpla, Fuerza de ese día se arma por reglas.
function keepGentle(blocks: PlannedBlock[], cfg: DayConfig, input: GuardInput, byRules: () => DayPlan) {
  if (!cfg.gentleStrength) return blocks;
  const byId = new Map(input.exercises.map((e) => [e.id, e]));
  return blocks.map((b) => {
    if (b.type !== 'main_strength') return b;
    const slots = b.slots.filter((s) => {
      const e = byId.get(s.exerciseId);
      return !!e && isGentle(e);
    });
    if (slots.length) return { ...b, slots };
    return byRules().blocks.find((r) => r.type === 'main_strength') ?? { ...b, slots };
  });
}

// Dosis dentro de los márgenes de las reglas: repeticiones hasta el tope del ejercicio
// (10 en potencia), descanso mínimo según el rol y el rol A/B/C marcado en Fuerza.
function withinLimits(slot: ExerciseSlot, block: BlockType, input: GuardInput, cycle: CycleInfo): ExerciseSlot {
  const e = input.exercises.find((x) => x.id === slot.exerciseId);
  if (!e) return slot;
  const role = block === 'main_strength' ? slotRole(e, cycle.stage) : null;
  const maxReps = role === 'A' ? POWER_REPS_MAX : e.prescription.repRange?.max;
  const reps = slot.reps != null && maxReps != null ? Math.min(slot.reps, maxReps) : slot.reps;
  if (!role) return { ...slot, reps };
  return { ...slot, reps, role, restSec: Math.max(slot.restSec, MIN_REST_SEC[role]) };
}

export function guardAiPlan(plan: GeneratedWeekPlan, input: GuardInput): GeneratedWeekPlan {
  const { days, profile, exercises, history, lockedByDay } = input;
  const cycle = cycleInfo(history, profile.level);
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
    // Cada día lleva exactamente sus partes y en su orden: si la IA omitió una, se arma por reglas.
    const wanted = PARTS.filter(([, part]) => cfg.blocks[part].enabled).map(([type]) => type);
    const rules = wanted.some((type) => !blocks.some((b) => b.type === type)) ? byRules() : null;
    blocks = wanted
      .map((type) => blocks.find((b) => b.type === type) ?? rules?.blocks.find((b) => b.type === type))
      .filter((b): b is PlannedBlock => !!b);
    blocks = keepGentle(blocks, cfg, input, byRules);
    blocks = ensureShoulderPrep(blocks, cfg, input);
    blocks = blocks.map((b) => {
      const slots = b.slots.map((s) => withinLimits(s, b.type, input, cycle));
      return b.type === 'main_strength' ? { ...b, slots: slots.map((s) => limitLoad(s, input)) } : { ...b, slots };
    });
    // Al final, cada parte se ajusta a sus minutos como en las reglas: series y, si sobra, ejercicios.
    const intensity = cycle.preparation ? 'light' : dayIntensity(days, day.day, profile.level);
    blocks = blocks.map((b) => {
      const part = PARTS.find(([type]) => type === b.type)![1];
      const slots = part === 'main' ? sortByRole(b.slots) : b.slots;
      return { ...b, slots: fitPart(part, slots, cfg, profile.level, cycle, intensity) };
    });
    return { ...day, blocks };
  });
  return { ...plan, days: guarded, summary: restored ? FIXED_KEPT_SUMMARY : plan.summary };
}
