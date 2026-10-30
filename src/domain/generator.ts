import { equipmentAt, MEDICAL_CONDITIONS, MUSCLE_GROUP_LABELS, MUSCLES, type MuscleGroupId } from './catalog';
import { type CycleInfo, cycleInfo, previousBlockExercises } from './cycle';
import { filterExercisesForUser } from './filter';
import type {
  DayConfig,
  DayPlan,
  Exercise,
  ExerciseSlot,
  GeneratedWeekPlan,
  LocalProfile,
  PlannedBlock,
  StrengthRole,
  WorkoutSession,
} from './schema';
import { painOf } from './schema';
import { progressSlot } from './progression';
import { fitPart, maxCount } from './timeBudget';
import { DAYS } from './week';

// Generador por reglas. Produce la misma estructura que devolverá el LLM
// (GeneratedWeekPlan), así la app no cambia cuando se conecte la IA, y sirve
// de respaldo si la IA falla o no hay conexión.

type Level = LocalProfile['level'];

const MAX_COMPLEXITY: Record<Level, number> = { beginner: 2, intermediate: 3, advanced: 5 };
const TARGET_COMPLEXITY: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 3 };

// Bloques de Fuerza. La secuencia define qué se agrega al subir la cantidad y qué se
// quita primero si falta tiempo: el final, por eso el remate C va tarde.
const ROLE_SEQUENCE: StrengthRole[] = ['A', 'B', 'B', 'B', 'C', 'A', 'B', 'B', 'B', 'B'];
const POWER_ROLE_SEQUENCE: StrengthRole[] = ['A', 'A', 'B', 'B', 'C', 'B', 'B', 'B', 'B', 'B'];
const FINISHER_IDS = ['kb_swing_finisher', 'kb_complex'];
const POWER_REPS_MAX = 10;
const POWER_REST_SEC = 120;
const CHOQUE_REPS_DOWN = 2;
const PREVIOUS_BLOCK_PENALTY = 1.2;
const ROLE_NOTE: Record<StrengthRole, string> = {
  A: 'Potencia: pocas repeticiones de calidad.',
  B: 'Baja en 3 s y sube rápido.',
  C: 'Remate: mantén la técnica aunque canses.',
};

export function strengthRole(e: Exercise): StrengthRole {
  if (FINISHER_IDS.includes(e.id) || e.movementPattern === 'carry') return 'C';
  return e.restrictionFlags.includes('ballistic') ? 'A' : 'B';
}

const ROLE_ORDER: StrengthRole[] = ['A', 'B', 'C'];
export const sortByRole = (slots: ExerciseSlot[]) =>
  [...slots].sort((a, b) => ROLE_ORDER.indexOf(a.role ?? 'B') - ROLE_ORDER.indexOf(b.role ?? 'B'));

// Barajado determinista (mismo resultado para la misma semana y día).
function seeded(seed: number) {
  let s = seed || 1;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) | 0), ((s >>> 0) % 10000) / 10000);
}

function prescribe(e: Exercise, profile: LocalProfile, rationale: string | null): ExerciseSlot {
  const p = e.prescription;
  const level = profile.level;
  const sets = level === 'beginner' ? Math.max(1, p.sets - 1) : p.sets;
  const reps = p.repRange
    ? level === 'beginner'
      ? p.repRange.min
      : level === 'advanced'
        ? p.repRange.max
        : Math.round((p.repRange.min + p.repRange.max) / 2)
    : null;
  return {
    exerciseId: e.id,
    sets,
    reps,
    durationSec: p.durationSec,
    weightKg: pickWeight(e, profile),
    restSec: p.restSec,
    rationale,
  };
}

// Peso de kettlebell: el más cercano por debajo del sugerido para su nivel
// entre los que el usuario tiene; si todos son más pesados, el más liviano.
export function pickWeight(e: Exercise, profile: LocalProfile): number | null {
  const guide = e.kettlebellGuide;
  const owned = profile.kettlebellWeightsKg;
  if (!guide || !e.equipment.required.includes('kettlebell') || owned.length === 0) return null;
  const target = guide.suggestedWeightKg[profile.level];
  const below = owned.filter((w) => w <= target);
  return below.length ? Math.max(...below) : Math.min(...owned);
}

function pickMain(
  pool: Exercise[],
  groups: MuscleGroupId[],
  count: number,
  profile: LocalProfile,
  usedThisWeek: Map<string, number>,
  rand: () => number,
  cycle: CycleInfo,
  previousBlock: Set<string>,
): { exercise: Exercise; group: MuscleGroupId }[] {
  const cap = MAX_COMPLEXITY[profile.level];
  // En el foco de técnica se prefieren ejercicios algo más simples.
  const target = Math.max(1, TARGET_COMPLEXITY[profile.level] - (cycle.phase === 'base' ? 1 : 0));
  // Orden fijo: el azar del puntaje no debe depender de cómo llegó barajada la lista.
  const candidates = pool.filter((e) => e.complexityLevel <= cap).sort((a, b) => a.id.localeCompare(b.id));
  const picked: { exercise: Exercise; group: MuscleGroupId }[] = [];
  const order = groups.length ? groups : (['legs', 'back', 'chest', 'core'] as MuscleGroupId[]);
  const roles = cycle.phase === 'power' ? POWER_ROLE_SEQUENCE : ROLE_SEQUENCE;
  let cursor = 0;

  // Ni repetido ni otra variante de la misma cadena (dos swings el mismo día).
  const isOpen = (e: Exercise) =>
    !picked.some(
      (p) =>
        p.exercise.id === e.id ||
        (e.progression.chainId !== null && p.exercise.progression.chainId === e.progression.chainId),
    );
  const best = (options: Exercise[], group: MuscleGroupId) =>
    options
      .filter((e) => e.muscleGroups.includes(group))
      .map((e) => ({
        e,
        // Menor puntaje = mejor: primario del grupo, complejidad cercana al nivel,
        // poco repetido en la semana, con kettlebell; algo de azar para variar.
        score:
          (e.anatomy.primary.some((m) => MUSCLES[m.muscle].group === group) ? 0 : 1) +
          Math.abs(e.complexityLevel - target) * 0.8 +
          (usedThisWeek.get(e.id) ?? 0) * 1.5 +
          (previousBlock.has(e.id) ? PREVIOUS_BLOCK_PENALTY : 0) +
          (e.equipment.required.includes('kettlebell') ? 0 : 0.4) +
          (e.mechanics === 'compound' ? 0 : 0.5) +
          rand() * 0.6,
      }))
      .sort((a, b) => a.score - b.score)[0]?.e;

  for (let i = 0; i < count; i++) {
    const open = candidates.filter(isOpen);
    // Sin balísticos o acarreos disponibles (lesión, nivel), ese lugar pasa al bloque B.
    const sources = [
      open.filter((e) => strengthRole(e) === (roles[i] ?? 'B')),
      open.filter((e) => strengthRole(e) === 'B'),
      open,
    ];
    let found = false;
    for (const source of sources) {
      for (let g = 0; g < order.length && !found; g++) {
        const group = order[(cursor + g) % order.length];
        const exercise = best(source, group);
        if (exercise) {
          picked.push({ exercise, group });
          cursor = (cursor + g + 1) % order.length;
          found = true;
        }
      }
      if (found) break;
    }
    if (!found) break;
  }
  return picked;
}

function generateDay(
  cfg: DayConfig,
  profile: LocalProfile,
  exercises: Exercise[],
  usedThisWeek: Map<string, number>,
  seed: number,
  cycle: CycleInfo,
  previousBlock: Set<string>,
  mainSeed = seed,
): DayPlan {
  const rand = seeded(seed);
  const mainRand = seeded(mainSeed);
  // Solo el equipamiento disponible donde entrena ese día (casa o parque).
  const dayProfile = { ...profile, equipment: equipmentAt(cfg.location, profile) };
  const pool = (block: Parameters<typeof filterExercisesForUser>[2]) =>
    filterExercisesForUser(exercises, dayProfile, block).sort(() => rand() - 0.5);
  const blocks: PlannedBlock[] = [];
  const b = cfg.blocks;

  // Fuerza primero: el calentamiento y la elongación dependen de lo elegido.
  // Día de fuerza suave (lesión): pocos ejercicios, sencillos y sin balísticos ni saltos.
  const mainPool = cfg.gentleStrength ? pool('main_strength').filter(isGentle) : pool('main_strength');
  const mainOptions = b.main.enabled
    ? pickMain(
        mainPool,
        b.main.muscleGroups,
        maxCount('main', cfg),
        profile,
        usedThisWeek,
        mainRand,
        cycle,
        previousBlock,
      )
    : [];
  // Cada parte recibe opciones de sobra y se queda con las que caben en sus minutos.
  const fit = (part: Parameters<typeof fitPart>[0], slots: ExerciseSlot[]) =>
    fitPart(part, slots, cfg, profile.level, cycle);
  const mainSlots = sortByRole(
    fit(
      'main',
      mainOptions.map(({ exercise, group }) => {
        const role = strengthRole(exercise);
        const slot = prescribe(
          exercise,
          profile,
          `Trabaja ${MUSCLE_GROUP_LABELS[group].toLowerCase()}. ${ROLE_NOTE[role]}`,
        );
        if (role !== 'A') return { ...slot, role };
        return {
          ...slot,
          role,
          reps: slot.reps && Math.min(slot.reps, POWER_REPS_MAX),
          restSec: Math.max(slot.restSec, POWER_REST_SEC),
        };
      }),
    ),
  );
  const main = mainOptions.filter((m) => mainSlots.some((s) => s.exerciseId === m.exercise.id));
  const mainGroups = new Set(main.flatMap((m) => m.exercise.muscleGroups));

  if (b.warmup.enabled) {
    // Preferir calentamientos que activen los grupos del día.
    const options = pool('warmup').sort(
      (x, y) =>
        Number(!y.muscleGroups.some((g) => mainGroups.has(g))) - Number(!x.muscleGroups.some((g) => mainGroups.has(g))),
    );
    blocks.push({
      type: 'warmup',
      slots: fit(
        'warmup',
        options.map((e) => prescribe(e, profile, null)),
      ),
    });
  }

  let prehabChosen: Exercise[] = [];
  if (b.prehab.enabled) {
    const fromConditions = new Set(
      profile.conditions.flatMap(
        (c) => MEDICAL_CONDITIONS.find((m) => m.id === c.conditionId)?.prehabExerciseIds ?? [],
      ),
    );
    const options = pool('prehab').sort((x, y) => Number(fromConditions.has(y.id)) - Number(fromConditions.has(x.id)));
    const prehabSlots = fit(
      'prehab',
      options.map((e) => prescribe(e, profile, fromConditions.has(e.id) ? 'Preventivo para tu condición.' : null)),
    );
    prehabChosen = options.filter((e) => prehabSlots.some((s) => s.exerciseId === e.id));
    blocks.push({ type: 'prehab', slots: prehabSlots });
  }

  if (b.main.enabled) {
    blocks.push({ type: 'main_strength', slots: mainSlots });
    main.forEach(({ exercise }) => usedThisWeek.set(exercise.id, (usedThisWeek.get(exercise.id) ?? 0) + 1));
  }

  if (b.cooldown.enabled) {
    const available = new Set(pool('cooldown').map((e) => e.id));
    // Estirar lo que se trabajó: fuerza y, en días de lesión, el prehab.
    const worked = [...main.map((m) => m.exercise), ...prehabChosen];
    const workedGroups = new Set(worked.flatMap((e) => e.muscleGroups));
    const linked = [...new Set(worked.flatMap((e) => e.cooldownStretchIds))].filter((id) => available.has(id));
    const byGroup = pool('cooldown')
      .filter((e) => !linked.includes(e.id) && e.muscleGroups.some((g) => workedGroups.has(g)))
      .map((e) => e.id);
    // Si aun así no hay nada (p. ej. solo calentamiento), elongación general.
    const general = pool('cooldown')
      .map((e) => e.id)
      .filter((id) => !linked.includes(id) && !byGroup.includes(id));
    const ids = [...linked, ...byGroup, ...general];
    blocks.push({
      type: 'cooldown',
      slots: fit(
        'cooldown',
        ids.map((id) =>
          prescribe(
            exercises.find((e) => e.id === id)!,
            profile,
            null,
          ),
        ),
      ),
    });
  }

  return { day: cfg.day, location: cfg.location, blocks: blocks.filter((bl) => bl.slots.length > 0) };
}

const GENTLE_FLAGS = ['ballistic', 'jumping', 'high_impact'] as const;
export const isGentle = (e: Exercise) =>
  e.complexityLevel <= 2 && !e.restrictionFlags.some((f) => (GENTLE_FLAGS as readonly string[]).includes(f));

// Ejercicios en los que la última vez (en las 2 últimas semanas) hubo dolor fuerte:
// se cambian por otros. Pasado ese plazo vuelven, más suaves (ver progressSlot).
export function strongPainIds(history: WorkoutSession[], now = Date.now()): string[] {
  const seen = new Set<string>();
  const painful: string[] = [];
  const since = now - 14 * 24 * 3600 * 1000;
  for (const s of history) {
    if (Date.parse(s.finishedAt) < since) continue;
    for (const id of new Set(s.sets.map((l) => l.exerciseId))) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (s.sets.some((l) => l.exerciseId === id && painOf(l) === 3)) painful.push(id);
    }
  }
  return painful;
}

const withoutPainful = (profile: LocalProfile, history: WorkoutSession[]): LocalProfile => ({
  ...profile,
  excludedExerciseIds: [...profile.excludedExerciseIds, ...strongPainIds(history)],
});

// Última molestia registrada en el ejercicio: con dolor, la semana del bloque no exige más.
const hadPain = (id: string, history: WorkoutSession[]) => {
  const last = history.find((s) => s.sets.some((l) => l.exerciseId === id));
  return !!last?.sets.some((l) => l.exerciseId === id && painOf(l) > 0);
};

// Semana del bloque sobre un ejercicio de Fuerza ya progresado.
function applyCycleWeek(
  slot: ExerciseSlot,
  prescribed: ExerciseSlot,
  e: Exercise,
  profile: LocalProfile,
  cycle: CycleInfo,
  history: WorkoutSession[],
): ExerciseSlot {
  if (hadPain(e.id, history)) return slot;
  if (cycle.week === 4) {
    const lighter = (a: number | null, b: number | null) => (a != null && b != null ? Math.min(a, b) : a);
    return {
      ...slot,
      reps: lighter(slot.reps, prescribed.reps),
      weightKg: lighter(slot.weightKg, prescribed.weightKg),
      rationale: 'Semana de descarga: menos volumen para recuperarte.',
    };
  }
  if (cycle.week !== 3 || slot.weightKg == null) return slot;
  const heavier = profile.kettlebellWeightsKg.filter((w) => w > slot.weightKg!).sort((a, b) => a - b)[0];
  if (heavier == null) return slot;
  const minReps = e.prescription.repRange?.min ?? 1;
  return {
    ...slot,
    weightKg: heavier,
    reps: slot.reps && Math.max(minReps, slot.reps - CHOQUE_REPS_DOWN),
    rationale: `Semana de choque: subimos a ${heavier} kg con menos repeticiones.`,
  };
}

// Ajustar series, reps y peso según lo que el usuario registró y la semana del bloque.
function applyProgression(
  d: DayPlan,
  cfg: DayConfig | undefined,
  profile: LocalProfile,
  exercises: Exercise[],
  history: WorkoutSession[],
  cycle: CycleInfo,
) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return {
    ...d,
    blocks: d.blocks.map((b) => ({
      ...b,
      slots: b.slots.map((s) => {
        const e = byId.get(s.exerciseId)!;
        const progressed = progressSlot(s, e, profile, history);
        const cycled = b.type === 'main_strength' && !cfg?.gentleStrength;
        return cycled ? applyCycleWeek(progressed, s, e, profile, cycle, history) : progressed;
      }),
    })),
  };
}

// Rehace un solo día con reglas; la fuerza de `otherDays` se penaliza para no repetirla.
export function generateDayByRules(
  cfg: DayConfig,
  otherDays: DayPlan[],
  profile: LocalProfile,
  exercises: Exercise[],
  history: WorkoutSession[] = [],
  seed = Date.now(),
): DayPlan {
  const usedThisWeek = new Map<string, number>();
  for (const s of otherDays.flatMap((d) => d.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots)))
    usedThisWeek.set(s.exerciseId, (usedThisWeek.get(s.exerciseId) ?? 0) + 1);
  const p = withoutPainful(profile, history);
  const cycle = cycleInfo(history);
  const day = generateDay(cfg, p, exercises, usedThisWeek, seed, cycle, previousBlockExercises(history, cycle));
  return applyProgression(day, cfg, profile, exercises, history, cycle);
}

export function generateWeekByRules(
  week: { days: DayConfig[] },
  profile: LocalProfile,
  exercises: Exercise[],
  history: WorkoutSession[] = [],
  seed = Date.now(),
): GeneratedWeekPlan {
  const usedThisWeek = new Map<string, number>();
  const cycle = cycleInfo(history);
  const previousBlock = previousBlockExercises(history, cycle);
  const days = week.days
    .filter((d) => d.active)
    .map((d, i) => {
      // Mismo bloque y día: mismos ejercicios de fuerza, para poder medir el progreso.
      const blockSeed = cycle.block * 1000 + DAYS.findIndex((x) => x.id === d.day) + 1;
      return generateDay(
        d,
        withoutPainful(profile, history),
        exercises,
        usedThisWeek,
        seed + i * 7919,
        cycle,
        previousBlock,
        blockSeed,
      );
    })
    .map((d) =>
      applyProgression(
        d,
        week.days.find((c) => c.day === d.day),
        profile,
        exercises,
        history,
        cycle,
      ),
    );
  const total = days.reduce((n, d) => n + d.blocks.reduce((m, b) => m + b.slots.length, 0), 0);
  const progressed = history.length > 0;
  return {
    days,
    summary: `${days.length} días de entrenamiento, ${total} ejercicios en total, ajustados a tu nivel, equipamiento y restricciones${progressed ? ' y a tu historial' : ''}.`,
  };
}
