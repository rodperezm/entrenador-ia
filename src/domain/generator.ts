import { equipmentAt, MEDICAL_CONDITIONS, MUSCLE_GROUP_LABELS, MUSCLES, type MuscleGroupId } from './catalog';
import { filterExercisesForUser } from './filter';
import type {
  DayConfig,
  DayPlan,
  Exercise,
  ExerciseSlot,
  GeneratedWeekPlan,
  LocalProfile,
  PlannedBlock,
  WorkoutSession,
} from './schema';
import { painOf } from './schema';
import { progressSlot } from './progression';

// Generador por reglas. Produce la misma estructura que devolverá el LLM
// (GeneratedWeekPlan), así la app no cambia cuando se conecte la IA, y sirve
// de respaldo si la IA falla o no hay conexión.

type Level = LocalProfile['level'];

const MAX_COMPLEXITY: Record<Level, number> = { beginner: 2, intermediate: 3, advanced: 5 };
const TARGET_COMPLEXITY: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 3 };

// Duración aproximada de un ejercicio prescrito (unos 4 s por repetición y
// 30 s para cambiar de ejercicio), para ajustar la rutina al tiempo del día.
export const slotSeconds = (s: ExerciseSlot) => {
  const perSet = s.durationSec ?? (s.reps ? s.reps * 4 : 45);
  return s.sets * perSet + (s.sets - 1) * s.restSec + 30;
};

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
): { exercise: Exercise; group: MuscleGroupId }[] {
  const cap = MAX_COMPLEXITY[profile.level];
  const target = TARGET_COMPLEXITY[profile.level];
  const candidates = pool.filter((e) => e.complexityLevel <= cap);
  const picked: { exercise: Exercise; group: MuscleGroupId }[] = [];
  const order = groups.length ? groups : (['legs', 'back', 'chest', 'core'] as MuscleGroupId[]);

  for (let i = 0; picked.length < count && i < count * order.length; i++) {
    const group = order[i % order.length];
    const options = candidates
      .filter(
        (e) =>
          e.muscleGroups.includes(group) &&
          // Ni repetido ni otra variante de la misma cadena (dos swings el mismo día).
          !picked.some(
            (p) =>
              p.exercise.id === e.id ||
              (e.progression.chainId !== null && p.exercise.progression.chainId === e.progression.chainId),
          ),
      )
      .map((e) => ({
        e,
        // Menor puntaje = mejor: primario del grupo, complejidad cercana al nivel,
        // poco repetido en la semana, con kettlebell; algo de azar para variar.
        score:
          (e.anatomy.primary.some((m) => MUSCLES[m.muscle].group === group) ? 0 : 1) +
          Math.abs(e.complexityLevel - target) * 0.8 +
          (usedThisWeek.get(e.id) ?? 0) * 1.5 +
          (e.equipment.required.includes('kettlebell') ? 0 : 0.4) +
          (e.mechanics === 'compound' ? 0 : 0.5) +
          rand() * 0.6,
      }))
      .sort((a, b) => a.score - b.score);
    if (options[0]) picked.push({ exercise: options[0].e, group });
  }
  return picked;
}

function generateDay(
  cfg: DayConfig,
  profile: LocalProfile,
  exercises: Exercise[],
  usedThisWeek: Map<string, number>,
  seed: number,
): DayPlan {
  const rand = seeded(seed);
  // Solo el equipamiento disponible donde entrena ese día (casa o parque).
  const dayProfile = { ...profile, equipment: equipmentAt(cfg.location, profile) };
  const pool = (block: Parameters<typeof filterExercisesForUser>[2]) =>
    filterExercisesForUser(exercises, dayProfile, block).sort(() => rand() - 0.5);
  const blocks: PlannedBlock[] = [];
  const b = cfg.blocks;

  // Fuerza primero: el calentamiento y la elongación dependen de lo elegido.
  const main = b.main.enabled
    ? pickMain(pool('main_strength'), b.main.muscleGroups, b.main.exerciseCount, profile, usedThisWeek, rand)
    : [];
  const mainGroups = new Set(main.flatMap((m) => m.exercise.muscleGroups));

  if (b.warmup.enabled) {
    // Preferir calentamientos que activen los grupos del día.
    const options = pool('warmup').sort(
      (x, y) =>
        Number(!y.muscleGroups.some((g) => mainGroups.has(g))) - Number(!x.muscleGroups.some((g) => mainGroups.has(g))),
    );
    blocks.push({
      type: 'warmup',
      slots: options.slice(0, b.warmup.exerciseCount).map((e) => prescribe(e, profile, null)),
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
    prehabChosen = options.slice(0, b.prehab.exerciseCount);
    blocks.push({
      type: 'prehab',
      slots: prehabChosen.map((e) =>
        prescribe(e, profile, fromConditions.has(e.id) ? 'Preventivo para tu condición.' : null),
      ),
    });
  }

  if (b.main.enabled) {
    blocks.push({
      type: 'main_strength',
      slots: main.map(({ exercise, group }) =>
        prescribe(exercise, profile, `Trabaja ${MUSCLE_GROUP_LABELS[group].toLowerCase()}.`),
      ),
    });
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
    const ids = [...linked, ...byGroup, ...general].slice(0, b.cooldown.exerciseCount);
    blocks.push({
      type: 'cooldown',
      slots: ids.map((id) =>
        prescribe(
          exercises.find((e) => e.id === id)!,
          profile,
          null,
        ),
      ),
    });
  }

  fitToTime(blocks, cfg.availableMinutes * 60);
  return { day: cfg.day, location: cfg.location, blocks: blocks.filter((bl) => bl.slots.length > 0) };
}

// Si la rutina no cabe en el tiempo del día, quita ejercicios del bloque más
// largo (empezando por el final), dejando al menos uno por bloque.
export function fitToTime(blocks: PlannedBlock[], budgetSec: number) {
  const total = () => blocks.reduce((s, bl) => s + bl.slots.reduce((t, sl) => t + slotSeconds(sl), 0), 0);
  while (total() > budgetSec) {
    const candidates = blocks.filter((bl) => bl.slots.length > 1);
    if (!candidates.length) return;
    const longest = candidates.reduce((a, c) => (c.slots.length > a.slots.length ? c : a));
    longest.slots.pop();
  }
}

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

// Ajustar series, reps y peso según lo que el usuario registró.
function applyProgression(d: DayPlan, profile: LocalProfile, exercises: Exercise[], history: WorkoutSession[]) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return {
    ...d,
    blocks: d.blocks.map((b) => ({
      ...b,
      slots: b.slots.map((s) => progressSlot(s, byId.get(s.exerciseId)!, profile, history)),
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
  return applyProgression(generateDay(cfg, p, exercises, usedThisWeek, seed), profile, exercises, history);
}

export function generateWeekByRules(
  week: { days: DayConfig[] },
  profile: LocalProfile,
  exercises: Exercise[],
  history: WorkoutSession[] = [],
  seed = Date.now(),
): GeneratedWeekPlan {
  const usedThisWeek = new Map<string, number>();
  const days = week.days
    .filter((d) => d.active)
    .map((d, i) => generateDay(d, withoutPainful(profile, history), exercises, usedThisWeek, seed + i * 7919))
    .map((d) => applyProgression(d, profile, exercises, history));
  const total = days.reduce((n, d) => n + d.blocks.reduce((m, b) => m + b.slots.length, 0), 0);
  const progressed = history.length > 0;
  return {
    days,
    summary: `${days.length} días de entrenamiento, ${total} ejercicios en total, ajustados a tu nivel, equipamiento y restricciones${progressed ? ' y a tu historial' : ''}.`,
  };
}
