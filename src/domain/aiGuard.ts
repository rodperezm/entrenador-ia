import { equipmentAt } from './catalog';
import { type CycleInfo, cycleInfo } from './cycle';
import { filterExercisesForUser, isUnsafeWeight } from './filter';
import { generateDayByRules, hadPain, isGentle, lastWeightOf, pickWeight, prescribe } from './generator';
import { feltTooMuch, progressSlot, wasTooHard } from './progression';
import { dayIntensity, MIN_REST_SEC, offZone, POWER_REPS_MAX, slotRole, sortByRole, weekFocus } from './strength';
import { fitPart, withMinCount } from './timeBudget';
import { dayNeeds, prepares, stretchesMuscle } from './coverage';
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
  rotate?: boolean; // semana nueva del ciclo: lockedByDay son solo las anclas
};

// Si la IA cambió ejercicios de Fuerza a mitad del ciclo, se restauran y se dice por qué. Su resumen
// no se usa porque podría hablar de los ejercicios que se quitaron; la explicación de la semana la
// arma la app con los datos reales.
const REZONED_SUMMARY =
  'Entrenas 4 días o más: la Fuerza va dividida en tren inferior y tren superior. Ajustamos los días en que la IA mezcló zonas, para que cada una descanse.';
const FIXED_KEPT_SUMMARY =
  'La IA propuso cambiar tus ejercicios ancla de Fuerza a mitad del ciclo; los mantuvimos para que puedas medir tu avance.';
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
  // Lo fijo (todo, en la misma semana; solo las anclas, en una semana nueva) tiene que estar. Lo demás
  // puede variar: en una semana nueva, rotar es lo esperado.
  const slots = day.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots);
  return fixed.some((id) => canStay(id) && !slots.some((s) => s.exerciseId === id));
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
  const { week } = cycleInfo(history, profile.level, input.days);
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

// La variedad no descuida el objetivo: si lo que entregó la IA deja un movimiento de Fuerza sin un
// calentamiento que lo prepare, o un músculo clave sin estirar, se cambia un ejercicio que no cubre
// nada por uno que sí. Lo que cubre va primero, para que el ajuste a los minutos no lo saque.
function ensureCoverage(blocks: PlannedBlock[], cfg: DayConfig, input: GuardInput): PlannedBlock[] {
  const byId = new Map(input.exercises.map((e) => [e.id, e]));
  const exOf = (type: BlockType) =>
    (blocks.find((b) => b.type === type)?.slots ?? []).flatMap((s) => byId.get(s.exerciseId) ?? []);
  // Lo que hay que preparar y estirar: la Fuerza del día o, en un día de Lesión, el trabajo de lesión.
  const main = exOf('main_strength');
  const worked = main.length ? main : exOf('prehab');
  if (!worked.length) return blocks;
  const needs = dayNeeds(worked);
  const dayProfile = { ...input.profile, equipment: equipmentAt(cfg.location, input.profile) };
  const used = new Set(blocks.flatMap((b) => b.slots.map((s) => s.exerciseId)));

  const fix = <N>(current: PlannedBlock[], type: BlockType, list: N[], covers: (e: Exercise, n: N) => boolean) =>
    current.map((b) => {
      if (b.type !== type || !b.slots.length) return b;
      const slots = [...b.slots];
      const ex = (s: ExerciseSlot) => byId.get(s.exerciseId);
      const isNeeded = (s: ExerciseSlot) => {
        const e = ex(s);
        return !!e && (e.tags.includes('shoulder_prep') || list.some((n) => covers(e, n)));
      };
      for (const need of list) {
        if (slots.some((s) => ex(s) && covers(ex(s)!, need))) continue;
        const pick = filterExercisesForUser(input.exercises, dayProfile, type).find(
          (e) => !used.has(e.id) && covers(e, need),
        );
        if (!pick) continue;
        used.add(pick.id);
        const slot = prescribe(pick, input.profile, null);
        const spare = slots
          .map((s, i) => (isNeeded(s) ? -1 : i))
          .filter((i) => i >= 0)
          .pop();
        if (spare != null) slots[spare] = slot;
        else slots.push(slot);
      }
      return { ...b, slots: [...slots.filter(isNeeded), ...slots.filter((s) => !isNeeded(s))] };
    });

  const warmed = fix(blocks, 'warmup', needs.movements, prepares);
  return fix(warmed, 'cooldown', needs.topMuscles, (e, m) => stretchesMuscle(e, m) || stretchesMuscle(e, m, true));
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
  const cycle = cycleInfo(history, profile.level, days);
  let restored = false;
  const zones = weekFocus(days);
  let rezoned = false;
  const guarded = plan.days.map((day) => {
    const cfg = days.find((d) => d.day === day.day);
    if (!cfg) return day;
    let blocks = day.blocks;
    const others = plan.days.filter((d) => d.day !== day.day);
    const byRules = () =>
      generateDayByRules(cfg, others, profile, exercises, history, 1, lockedByDay[day.day], days, !!input.rotate);
    if (changedWithoutReason(day, cfg, input)) {
      restored = true;
      const main = byRules().blocks.find((b) => b.type === 'main_strength');
      blocks = main ? blocks.map((b) => (b.type === 'main_strength' ? main : b)) : blocks;
    }
    // Semana dividida por zonas: si la IA mezcló zonas en un día (piernas en el de tren superior,
    // por ejemplo), la Fuerza de ese día la arman las reglas. Sin eso no hay recuperación entre días.
    const focus = (!cfg.gentleStrength && zones[day.day]?.focus) || 'full';
    const mixed = blocks
      .filter((b) => b.type === 'main_strength')
      .flatMap((b) => b.slots)
      .some((s) => {
        const e = exercises.find((x) => x.id === s.exerciseId);
        return !!e && offZone(e, focus);
      });
    if (mixed) {
      rezoned = true;
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
    blocks = ensureCoverage(blocks, cfg, input);
    blocks = blocks.map((b) => {
      const slots = b.slots.map((s) => withinLimits(s, b.type, input, cycle));
      return b.type === 'main_strength' ? { ...b, slots: slots.map((s) => limitLoad(s, input)) } : { ...b, slots };
    });
    // Al final, cada parte se ajusta a sus minutos como en las reglas: series y, si sobra, ejercicios.
    const intensity = cycle.preparation ? 'light' : dayIntensity(days, day.day, profile.level);
    // Como en las reglas: un estiramiento por cada músculo clave de la Fuerza (o de la Lesión), aunque los minutos dieran menos.
    const slotsEx = (type: BlockType) =>
      (blocks.find((b) => b.type === type)?.slots ?? []).flatMap(
        (s) => exercises.find((e) => e.id === s.exerciseId) ?? [],
      );
    const workedEx = slotsEx('main_strength').length ? slotsEx('main_strength') : slotsEx('prehab');
    const cooldownCfg = withMinCount(cfg, 'cooldown', dayNeeds(workedEx).topMuscles.length, profile.level);
    blocks = blocks.map((b) => {
      const part = PARTS.find(([type]) => type === b.type)![1];
      const slots = part === 'main' ? sortByRole(b.slots) : b.slots;
      return {
        ...b,
        slots: fitPart(
          part,
          slots,
          part === 'cooldown' ? cooldownCfg : cfg,
          profile.level,
          cycle,
          intensity,
          part === 'main' && focus !== 'full',
        ),
      };
    });
    return { ...day, blocks };
  });
  return { ...plan, days: guarded, summary: restored ? FIXED_KEPT_SUMMARY : rezoned ? REZONED_SUMMARY : plan.summary };
}
