import { equipmentAt, MEDICAL_CONDITIONS, type MuscleGroupId } from './catalog';
import { trainingStamp } from '@/domain/profileStamp';
import { type CycleInfo, cycleInfo, previousBlockExercises } from './cycle';
import { filterExercisesForUser, weightsFor } from './filter';
import type {
  CantDoReason,
  DayConfig,
  DayPlan,
  Exercise,
  ExerciseSlot,
  GeneratedWeekPlan,
  LocalProfile,
  PlannedBlock,
  StoredWeekPlan,
  StrengthRole,
  WorkoutSession,
} from './schema';
import { painOf } from './schema';
import { BIG_JUMP, feltTooMuch, progressSlot, wasTooHard } from './progression';
import {
  A_STAGES,
  FREE_BALLISTIC_STAGE,
  unlockedA,
  anchorIds,
  dayIntensity,
  type DayFocus,
  isArmAccessory,
  isZoneAccessory,
  offZone,
  type Intensity,
  type SessionNeed,
  sessionNeeds,
  MIN_REST_SEC,
  POWER_REPS_MAX,
  slotRole,
  sortByRole,
  strengthRole,
  weekFocus,
  zoneOf,
} from './strength';
import { capMainTime, fitPart, maxCount, withMinCount } from './timeBudget';
import { coverFirst, coverMuscles, dayNeeds, prepares } from './coverage';
import { DAYS, dayDate, isFromPastWeek } from './week';

// Generador por reglas. Produce la misma estructura que devolverá el LLM
// (GeneratedWeekPlan), así la app no cambia cuando se conecte la IA, y sirve
// de respaldo si la IA falla o no hay conexión.

type Level = LocalProfile['level'];

type DayStrengthPlan = {
  cycle: CycleInfo;
  intensity: Intensity;
  previousBlock: Set<string>;
  history: WorkoutSession[];
  locked: Set<string>;
  mainSeed?: number;
  rotate?: boolean;
  // Zona del día cuando la semana se divide (4 a 6 días de Fuerza) y qué vuelta de esa zona es.
  focus?: DayFocus;
  turn?: number;
};

const MAX_COMPLEXITY: Record<Level, number> = { beginner: 2, intermediate: 3, advanced: 5 };
const TARGET_COMPLEXITY: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 3 };

const POWER_REPS_FOCUS = 6;
const POWER_MIN_SETS = 3;
const CHOQUE_REPS_DOWN = 2;
const CHOQUE_REST = 0.75;
const LADDER_REST_DOWN = 15;
const minRest = (slot: ExerciseSlot) => MIN_REST_SEC[slot.role ?? 'B'];
const DENSITY_REPS_UP = 2;
const DENSITY_SEC_UP = 10;
const DENSITY_MAX_COMPLEXITY = 3; // los levantamientos muy técnicos no se apuran con fatiga
const ROLE_NOTE: Record<StrengthRole, string> = {
  A: 'Potencia: pocas repeticiones de calidad.',
  B: 'Baja en 3 s y sube rápido.',
  C: 'Remate: mantén la técnica aunque canses.',
};
export const LIGHT_DUMBBELL_NOTE = 'Peso liviano para ti: baja en 3 s y pausa 1 s abajo.';

// Fuerza B según el foco del ciclo: Técnica con más repeticiones y lento, Fuerza con menos
// repeticiones y más descanso, Potencia con subida rápida. Siempre dentro del rango del ejercicio.
const FOCUS_B: Record<CycleInfo['phase'], { reps: number; restSec: number; note: string }> = {
  base: { reps: 12, restSec: 90, note: 'Técnica: baja en 3 s con pausa de 1 s abajo, peso cómodo.' },
  strength: {
    reps: 5,
    restSec: 150,
    note: 'Fuerza: baja en 3 s, peso exigente; termina con 1 o 2 repeticiones en reserva.',
  },
  power: { reps: 7, restSec: 120, note: 'Potencia: baja controlado y sube lo más rápido que puedas.' },
};

function forFocus(slot: ExerciseSlot, e: Exercise, phase: CycleInfo['phase']): ExerciseSlot {
  const range = e.prescription.repRange;
  if (slot.reps == null || !range || slot.rationale === LIGHT_DUMBBELL_NOTE) return slot;
  const focus = FOCUS_B[phase];
  const reps = Math.min(range.max, Math.max(range.min, focus.reps));
  return { ...slot, reps, restSec: Math.max(slot.restSec, focus.restSec), rationale: focus.note };
}
// Barajado determinista (mismo resultado para la misma semana y día).
function seeded(seed: number) {
  let s = seed || 1;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) | 0), ((s >>> 0) % 10000) / 10000);
}

export function prescribe(e: Exercise, profile: LocalProfile, rationale: string | null): ExerciseSlot {
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
  const weightKg = pickWeight(e, profile);
  // Mancuernas bajo lo sugerido: se compensa con el tope de repeticiones y tempo lento.
  const light = e.dumbbellGuide != null && weightKg != null && weightKg < e.dumbbellGuide.suggestedWeightKg[level];
  return {
    exerciseId: e.id,
    sets,
    reps: light && p.repRange ? p.repRange.max : reps,
    durationSec: p.durationSec,
    weightKg,
    restSec: p.restSec,
    rationale: light ? LIGHT_DUMBBELL_NOTE : rationale,
  };
}

const suggestedKg = (e: Exercise, profile: LocalProfile) =>
  e.dumbbellGuide
    ? e.dumbbellGuide.suggestedWeightKg[profile.level]
    : e.equipment.required.includes('kettlebell')
      ? e.kettlebellGuide?.suggestedWeightKg[profile.level]
      : undefined;

// Peso de kettlebell o mancuerna: el más cercano por debajo del sugerido para su nivel
// entre los que el usuario tiene; si todos son más pesados, el más liviano.
export function pickWeight(e: Exercise, profile: LocalProfile): number | null {
  const target = suggestedKg(e, profile);
  const owned = weightsFor(e, profile);
  if (target == null || owned.length === 0) return null;
  const below = owned.filter((w) => w <= target);
  return below.length ? Math.max(...below) : Math.min(...owned);
}

const nextIds = (ids: Set<string>, exercises: Exercise[]) =>
  new Set(exercises.filter((e) => ids.has(e.id)).flatMap((e) => e.progression.next));

type MainContext = {
  usedThisWeek: Map<string, number>;
  rand: () => number;
  cycle: CycleInfo;
  previousBlock: Set<string>;
  all: Exercise[];
  locked: Set<string>;
  intensity: Intensity;
  dayIndex: number;
  focus: DayFocus;
  turn: number;
  // Semana nueva del mismo ciclo: lo fijo son las anclas y el resto se elige de nuevo, rotando.
  rotate: boolean;
  recentMain: Map<string, number>; // castigo por haberlo hecho hace poco, para variar
};

// Brazos de la semana: si aún no hay bíceps o tríceps en los días ya armados, este día pide el que falta.
const worksMuscle = (e: Exercise, m: 'biceps' | 'triceps') => e.anatomy.primary.some((a) => a.muscle === m);
function armFocus(ctx: MainContext): 'biceps' | 'triceps' | null {
  const done = [...ctx.usedThisWeek.keys()]
    .flatMap((id) => ctx.all.find((e) => e.id === id) ?? [])
    .filter(isArmAccessory);
  const hasBiceps = done.some((e) => worksMuscle(e, 'biceps'));
  const hasTriceps = done.some((e) => worksMuscle(e, 'triceps'));
  if (hasBiceps && hasTriceps) return null;
  if (!hasBiceps && !hasTriceps) return ctx.dayIndex % 2 ? 'triceps' : 'biceps';
  return hasBiceps ? 'triceps' : 'biceps';
}

// Para que la semana no sea copia de la anterior: lo hecho en la última semana pesa mucho más
// que lo de hace dos o tres. Las anclas no pasan por aquí: se mantienen.
const MAIN_RECENT = [
  { days: 8, penalty: 3 },
  { days: 22, penalty: 1.2 },
];
export function recentMainPenalty(history: WorkoutSession[], now = Date.now()) {
  const out = new Map<string, number>();
  for (const s of history) {
    const age = (now - Date.parse(s.finishedAt)) / (24 * 3600 * 1000);
    const step = MAIN_RECENT.find((r) => age <= r.days);
    if (!step) continue;
    for (const l of s.sets) if (!l.format) out.set(l.exerciseId, Math.max(out.get(l.exerciseId) ?? 0, step.penalty));
  }
  return out;
}

// Lo que se conserva al armar una semana: misma semana, todo (rehacer no cambia los ejercicios);
// semana nueva del mismo ciclo, solo las anclas, y el resto rota; ciclo nuevo, nada.
// `days`: la semana tal como está configurada ahora. Si la zona de un día cambió (por ejemplo, al pasar
// de 3 a 4 días de Fuerza), lo fijado que no es de esa zona se suelta.
export function weekLocks(
  plan: StoredWeekPlan | null,
  cycleBlock: string,
  exercises: Exercise[],
  days: DayConfig[] = [],
) {
  if (!plan || plan.cycleBlock !== cycleBlock) return { lockedByDay: {}, rotate: false };
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const rotate = isFromPastWeek(plan.generatedAt);
  const zones = weekFocus(days);
  const lockedByDay: Partial<Record<DayConfig['day'], string[]>> = Object.fromEntries(
    plan.days.map((d) => {
      const slots = d.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots);
      const ids = rotate ? anchorIds(slots, byId) : slots.map((x) => x.exerciseId);
      const focus = zones[d.day]?.focus ?? 'full';
      return [d.day, ids.filter((id) => !byId.has(id) || !offZone(byId.get(id)!, focus))];
    }),
  );
  return { lockedByDay, rotate };
}

const patternFamily = (e: Exercise) =>
  ['squat', 'lunge'].includes(e.movementPattern) ? 'legs' : e.movementPattern.split('_')[0];

// Elige por patrón. Cada lugar de la sesión busca primero lo ya fijado en este bloque.
function pickMain(pool: Exercise[], groups: MuscleGroupId[], count: number, profile: LocalProfile, ctx: MainContext) {
  const { cycle, previousBlock, usedThisWeek, rand, locked } = ctx;
  // Día suave de una semana dividida: técnica y control, con ejercicios un punto más simples.
  const easier = ctx.focus !== 'full' && ctx.intensity === 'light' ? 1 : 0;
  const cap = Math.max(2, MAX_COMPLEXITY[profile.level] - easier);
  const target = Math.max(1, TARGET_COMPLEXITY[profile.level] - easier);
  // Orden fijo: el azar del puntaje no debe depender de cómo llegó barajada la lista.
  const candidates = pool
    .filter((e) => e.complexityLevel <= cap && strengthRole(e) !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  const picked: { exercise: Exercise; role: StrengthRole }[] = [];
  const wantedGroups = new Set(groups);
  const canUseBallistics =
    ctx.intensity !== 'light' && candidates.some((e) => e.restrictionFlags.includes('ballistic'));
  const allowsStageOne = !profile.conditions.some((c) => c.activeFlags.includes('ballistic'));
  const next = nextIds(previousBlock, ctx.all);
  // Al cambiar de bloque se mantiene el patrón y cambia el estímulo: prefiere la variante
  // siguiente y evita repetir el ejercicio. El bloque A se rige por sus etapas.
  const spiralBonus = (e: Exercise) => (next.has(e.id) ? 1.6 : previousBlock.has(e.id) ? -2 : 0);

  const isOpen = (e: Exercise) =>
    !picked.some(
      (p) =>
        p.exercise.id === e.id ||
        (e.progression.chainId !== null && p.exercise.progression.chainId === e.progression.chainId),
    );
  const choose = (options: Exercise[]) =>
    options.find((e) => locked.has(e.id)) ??
    options
      .map((e) => ({
        e,
        // Menor puntaje = mejor: complejidad cercana al nivel, poco repetido en la semana,
        // con kettlebell, en las zonas elegidas y siguiendo la espiral del bloque.
        score:
          // Más fácil que su nivel pesa casi el triple: variar no debe sentirse como retroceder.
          (e.complexityLevel < target ? (target - e.complexityLevel) * 2.2 : (e.complexityLevel - target) * 0.8) +
          (usedThisWeek.get(e.id) ?? 0) * 2.2 +
          (e.equipment.required.includes('kettlebell') ? 0 : 0.4) +
          (e.mechanics === 'compound' ? 0 : 0.5) +
          (e.muscleGroups.some((g) => wantedGroups.has(g as MuscleGroupId)) ? 0 : 0.4) +
          (ctx.recentMain.get(e.id) ?? 0) -
          spiralBonus(e) +
          rand() * 0.6,
      }))
      .sort((a, b) => a.score - b.score)[0]?.e;

  const forNeed = (need: SessionNeed): Exercise | undefined => {
    const open = candidates.filter(isOpen);
    const inRole = (role: StrengthRole) => open.filter((e) => strengthRole(e) === role);
    if (need.role === 'A') {
      if (need.explosive) {
        if (!canUseBallistics || cycle.stage < FREE_BALLISTIC_STAGE) return undefined;
        return choose(open.filter((e) => unlockedA(cycle.stage).includes(e.id)));
      }
      const isStageOne = cycle.stage === 1;
      if (isStageOne ? allowsStageOne : canUseBallistics) {
        // Primero lo nuevo de su etapa (así puede confirmarlo); si no se puede, lo ya ganado.
        const stage =
          choose(open.filter((e) => A_STAGES[cycle.stage - 1].includes(e.id))) ??
          choose(open.filter((e) => unlockedA(cycle.stage).includes(e.id)));
        if (stage) return stage;
      }
      return choose(inRole('B').filter((e) => e.movementPattern === 'hinge'));
    }
    if (need.role === 'C') {
      const calm = (list: Exercise[]) =>
        canUseBallistics ? list : list.filter((e) => !e.restrictionFlags.includes('ballistic'));
      // Semana dividida: cada día pide su remate (brazos, acarreo, core o accesorio de la zona).
      if (need.kind === 'arms') {
        // Bíceps y tríceps se alternan dentro del día y en la semana.
        const had = picked.filter((p) => isArmAccessory(p.exercise));
        const want = had.some((p) => worksMuscle(p.exercise, 'biceps'))
          ? 'triceps'
          : had.some((p) => worksMuscle(p.exercise, 'triceps'))
            ? 'biceps'
            : (need.muscle ?? armFocus(ctx) ?? 'biceps');
        const armsPool = inRole('C').filter(isArmAccessory);
        return choose(armsPool.filter((e) => worksMuscle(e, want))) ?? choose(armsPool);
      }
      if (need.kind === 'carry') return choose(calm(inRole('C').filter((e) => e.movementPattern === 'carry')));
      if (need.kind === 'core') {
        const core = calm(inRole('C').filter((e) => e.movementPattern.startsWith('core_')));
        // Primero un tipo de core que el día aún no tenga (anti-extensión, anti-rotación, rotación, flexión).
        const fresh = core.filter((e) => !picked.some((p) => p.exercise.movementPattern === e.movementPattern));
        return choose(fresh) ?? choose(core);
      }
      if (need.kind === 'lower' || need.kind === 'upper') {
        return choose(inRole('C').filter((e) => isZoneAccessory(e) && zoneOf(e) === need.kind));
      }
      // Brazos: un día bíceps y otro tríceps en la semana, si la lesión lo permite (el filtro ya lo cuida).
      const arm = armFocus(ctx);
      const arms = arm ? choose(inRole('C').filter((e) => isArmAccessory(e) && worksMuscle(e, arm))) : undefined;
      if (arms) return arms;
      // En cuerpo completo no entran los accesorios de zona: el remate es acarreo, core o cierre.
      const options = inRole('C').filter((e) => !isArmAccessory(e) && !isZoneAccessory(e));
      if (!canUseBallistics) return choose(options.filter((e) => !e.restrictionFlags.includes('ballistic')));
      return choose(options.filter((e) => e.movementPattern === 'carry')) ?? choose(options);
    }
    // Etapa 1: el bloque A ya es un peso muerto; la bisagra de fuerza no repite otro peso muerto básico.
    const sameAsA = (e: Exercise) =>
      cycle.stage === 1 && A_STAGES[0].includes(e.id) && picked.some((p) => A_STAGES[0].includes(p.exercise.id));
    for (const pattern of need.patterns ?? []) {
      const exercise = choose(inRole('B').filter((e) => e.movementPattern === pattern && !sameAsA(e)));
      if (exercise) return exercise;
    }
    return undefined;
  };

  // Dentro del bloque se conservan los fijos. Si uno ya no se puede, entra otro igual o más simple
  // de la misma familia; si no hay, se omite antes que repetir otro patrón.
  const staged = A_STAGES.flat();
  const stageNow = unlockedA(cycle.stage);
  for (const id of locked) {
    const lockedEx = ctx.all.find((e) => e.id === id);
    if (lockedEx && offZone(lockedEx, ctx.focus)) continue; // la zona del día cambió: ese fijo ya no corresponde
    const fixed = candidates.find((e) => e.id === id && (!staged.includes(id) || stageNow.includes(id)));
    const original = ctx.all.find((e) => e.id === id);
    const role = original && strengthRole(original);
    const replacement =
      fixed ??
      (role === 'A' || (original && staged.includes(id))
        ? forNeed({ role: 'A', patterns: ['hinge'] })
        : role && original
          ? choose(
              candidates
                .filter(isOpen)
                .filter(
                  (e) =>
                    strengthRole(e) === role &&
                    e.complexityLevel <= original.complexityLevel &&
                    patternFamily(e) === patternFamily(original),
                ),
            )
          : undefined);
    if (replacement) picked.push({ exercise: replacement, role: slotRole(replacement, cycle.stage) ?? 'B' });
  }
  // Misma semana: se conserva todo. Semana nueva del ciclo: las anclas van y el resto se elige otra vez.
  if (locked.size && !ctx.rotate) return picked;

  // Cada lugar de la sesión se cubre una vez: si un fijo ya lo cumple (p. ej. el ancla de piernas),
  // no se agrega otro igual.
  const used = new Set<number>();
  const fills = (p: (typeof picked)[number], need: SessionNeed) =>
    need.role === 'B'
      ? p.role === 'B' && (need.patterns ?? []).includes(p.exercise.movementPattern)
      : p.role === need.role;
  for (const need of sessionNeeds(cycle.phase === 'power', ctx.dayIndex, ctx.focus, ctx.turn)) {
    if (picked.length >= count) break;
    const match = picked.findIndex((p, i) => !used.has(i) && fills(p, need));
    if (match >= 0) {
      used.add(match);
      continue;
    }
    const exercise = forNeed(need);
    if (exercise) {
      picked.push({ exercise, role: slotRole(exercise, cycle.stage) ?? 'B' });
      used.add(picked.length - 1);
    }
  }
  return picked;
}
function generateDay(
  cfg: DayConfig,
  profile: LocalProfile,
  exercises: Exercise[],
  usedThisWeek: Map<string, number>,
  seed: number,
  plan: DayStrengthPlan,
): DayPlan {
  const rand = seeded(seed);
  const { cycle, intensity } = plan;
  const mainRand = seeded(plan.mainSeed ?? seed);
  // Solo el equipamiento disponible donde entrena ese día (casa o parque).
  const dayProfile = { ...profile, equipment: equipmentAt(cfg.location, profile) };
  const pool = (block: Parameters<typeof filterExercisesForUser>[2]) =>
    filterExercisesForUser(exercises, dayProfile, block).sort(() => rand() - 0.5);
  const blocks: PlannedBlock[] = [];
  const b = cfg.blocks;

  // Fuerza primero: el calentamiento y la elongación dependen de lo elegido.
  // Día de fuerza suave (lesión): pocos ejercicios, sencillos y sin balísticos ni saltos.
  const resting = legsRestIds(exercises, plan.history);
  const strengthPool = pool('main_strength').filter((e) => !resting.includes(e.id));
  const mainPool = cfg.gentleStrength ? strengthPool.filter(isGentle) : strengthPool;
  const mainOptions = b.main.enabled
    ? pickMain(mainPool, b.main.muscleGroups, maxCount('main', cfg), profile, {
        usedThisWeek,
        rand: mainRand,
        cycle,
        previousBlock: plan.previousBlock,
        all: exercises,
        locked: plan.locked,
        intensity,
        dayIndex: DAYS.findIndex((x) => x.id === cfg.day),
        focus: (!cfg.gentleStrength && plan.focus) || 'full',
        turn: plan.turn ?? 0,
        rotate: !!plan.rotate,
        recentMain: recentMainPenalty(plan.history),
      })
    : [];
  // Cada parte recibe opciones de sobra y se queda con las que caben en sus minutos.
  const fit = (part: Parameters<typeof fitPart>[0], slots: ExerciseSlot[]) =>
    // Dividida por zonas, el remate (brazos, core, accesorios) es parte del día: no se quita por poco.
    fitPart(
      part,
      slots,
      cfg,
      profile.level,
      cycle,
      intensity,
      part === 'main' && !!plan.focus && plan.focus !== 'full',
    );
  const mainSlots = sortByRole(
    fit(
      'main',
      mainOptions.map(({ exercise, role }) => {
        const base = prescribe(exercise, profile, null);
        const slot = {
          ...base,
          role,
          rationale: base.rationale === LIGHT_DUMBBELL_NOTE ? base.rationale : base.reps ? ROLE_NOTE[role] : null,
        };
        const rested = { ...slot, restSec: Math.max(slot.restSec, MIN_REST_SEC[role]) };
        if (role === 'B') return cfg.gentleStrength ? rested : forFocus(rested, exercise, cycle.phase);
        if (role !== 'A') return rested;
        const repsMax = cycle.phase === 'power' ? POWER_REPS_FOCUS : POWER_REPS_MAX;
        return {
          ...rested,
          sets: Math.max(slot.sets, POWER_MIN_SETS),
          reps: slot.reps && Math.min(slot.reps, repsMax),
        };
      }),
    ),
  );
  const main = mainOptions.filter((m) => mainSlots.some((s) => s.exerciseId === m.exercise.id));
  // En el orden de la sesión (A, B, C): lo primero que se prepara y estira es lo del bloque A.
  const mainInOrder = mainSlots.flatMap((s) => main.find((m) => m.exercise.id === s.exerciseId)?.exercise ?? []);
  const mainGroups = new Set(main.flatMap((m) => m.exercise.muscleGroups));
  // Variedad: Fuerza se mantiene en el bloque para medir el avance, pero calentamiento, lesión y
  // elongación prefieren lo que no hizo en los últimos días, entre ejercicios que sirven igual.
  const recent = recentExerciseIds(plan.history);
  const fresh = (e: Exercise) => Number(!recent.has(e.id));

  if (b.warmup.enabled) {
    // Sin fuerza el calentamiento es suave. Preferir los que activen los grupos del día.
    const warmups = pool('warmup');
    const gentleWarmups = warmups.filter(isGentle);
    const activates = (e: Exercise) => Number(e.muscleGroups.some((g) => mainGroups.has(g)));
    const options = (b.main.enabled || !gentleWarmups.length ? warmups : gentleWarmups).sort(
      (x, y) => activates(y) - activates(x) || fresh(y) - fresh(x),
    );
    // Fijos al inicio: el principiante con swing o peso muerto parte con el ejercicio que enseña la
    // bisagra; con barra de activación, todo día de fuerza prepara el hombro.
    const forced: Exercise[] = [];
    if (profile.level === 'beginner' && main.some((m) => m.exercise.movementPattern === 'hinge')) {
      const drill = options.find((e) => e.tags.includes('hinge_drill'));
      if (drill) forced.push(drill);
    }
    const shoulderPrep = main.length ? options.find((e) => e.tags.includes('shoulder_prep')) : undefined;
    if (shoulderPrep) forced.push(shoulderPrep);
    // Con una lesión, el día de Fuerza no lleva bloque de Lesión, pero el calentamiento parte activando
    // esa zona con uno de sus ejercicios indicados.
    const activation =
      main.length && !b.prehab.enabled
        ? injuryActivation(
            profile,
            pool('prehab'),
            forced.map((e) => e.id),
          )
        : undefined;
    if (activation) forced.unshift(activation);
    // Después, uno que prepare cada movimiento de la Fuerza de hoy (el de A primero); la variedad
    // solo elige entre los que preparan lo mismo, y el resto viene detrás.
    const covered = coverFirst(
      options.filter((e) => !forced.includes(e)),
      dayNeeds(mainInOrder).movements,
      prepares,
      forced,
    );
    blocks.push({
      type: 'warmup',
      slots: fit(
        'warmup',
        covered.map((e) => prescribe(e, profile, null)),
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
    // Primero los de su condición; un parecido (mismos grupos) sin repetir le gana a uno de la condición
    // que ya hizo esta semana, para que la lesión no sea siempre la misma lista.
    const conditionGroups = new Set(exercises.filter((e) => fromConditions.has(e.id)).flatMap((e) => e.muscleGroups));
    const score = (e: Exercise) =>
      (fromConditions.has(e.id) ? 2 : e.muscleGroups.some((g) => conditionGroups.has(g)) ? 1 : 0) + 1.5 * fresh(e);
    const sorted = pool('prehab').sort((x, y) => score(y) - score(x));
    // Siempre al menos 2 de su condición, aunque los haya hecho: rotan entre ellos (primero los que no hizo).
    const own = sorted.filter((e) => fromConditions.has(e.id)).sort((x, y) => fresh(y) - fresh(x));
    const kept = own.slice(0, PREHAB_OWN_MIN);
    const options = [...kept, ...sorted.filter((e) => !kept.includes(e))];
    const prehabSlots = fit(
      'prehab',
      options.map((e) =>
        prescribe(e, profile, fromConditions.has(e.id) ? 'Para cuidar tu lesión. No reemplaza un tratamiento.' : null),
      ),
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
    // Si aun así no hay nada (p. ej. día solo de elongación), elongación general.
    const general = pool('cooldown')
      .map((e) => e.id)
      .filter((id) => !linked.includes(id) && !byGroup.includes(id));
    // Lo ligado a lo trabajado primero, pero sin repetir lo de la semana pasada si hay otro que estire lo mismo.
    const byId = new Map(exercises.map((e) => [e.id, e]));
    const isFresh = (id: string) => fresh(byId.get(id)!) === 1;
    const ids = [
      ...linked.filter(isFresh),
      ...byGroup.filter(isFresh),
      ...linked.filter((id) => !isFresh(id)),
      ...byGroup.filter((id) => !isFresh(id)),
      ...general.filter(isFresh),
      ...general.filter((id) => !isFresh(id)),
    ];
    // Primero un estiramiento para cada músculo principal trabajado; la variedad elige entre los que
    // estiran ese mismo músculo.
    const ordered = coverMuscles(
      ids.map((id) => byId.get(id)!),
      dayNeeds(mainInOrder, prehabChosen).muscles,
    );
    // Al menos un estiramiento por cada músculo clave de la Fuerza (o de la Lesión, si no hay Fuerza), aunque
    // los minutos dieran menos: son cortos y estirar lo trabajado es el objetivo de la elongación.
    const cooldownCfg = withMinCount(
      cfg,
      'cooldown',
      dayNeeds(mainInOrder.length ? mainInOrder : prehabChosen).topMuscles.length,
      profile.level,
    );
    blocks.push({
      type: 'cooldown',
      slots: fitPart(
        'cooldown',
        ordered.map((e) => prescribe(e, profile, null)),
        cooldownCfg,
        profile.level,
        cycle,
        intensity,
      ),
    });
  }

  return { day: cfg.day, location: cfg.location, blocks: blocks.filter((bl) => bl.slots.length > 0) };
}

// Un ejercicio de los indicados para la lesión de la persona, de los que puede hacer ese día.
export function injuryActivation(profile: LocalProfile, allowedPrehab: Exercise[], skip: string[] = []) {
  const own = profile.conditions.flatMap(
    (c) => MEDICAL_CONDITIONS.find((m) => m.id === c.conditionId)?.prehabExerciseIds ?? [],
  );
  return own.flatMap((id) => allowedPrehab.find((e) => e.id === id) ?? []).find((e) => !skip.includes(e.id));
}

// Lo que hizo en los últimos 8 días (una semana y un poco): base de la variedad entre semanas.
const RECENT_MS = 8 * 24 * 3600 * 1000;
const PREHAB_OWN_MIN = 2; // ejercicios de su condición que siempre van en Lesión
export function recentExerciseIds(history: WorkoutSession[], now = Date.now()) {
  return new Set(
    history.filter((s) => Date.parse(s.finishedAt) >= now - RECENT_MS).flatMap((s) => s.sets.map((l) => l.exerciseId)),
  );
}

const GENTLE_FLAGS = ['ballistic', 'jumping', 'high_impact'] as const;
export const isGentle = (e: Exercise) =>
  e.complexityLevel <= 2 && !e.restrictionFlags.some((f) => (GENTLE_FLAGS as readonly string[]).includes(f));

// Ejercicios que se cambian por otros (en las 2 últimas semanas): dolor fuerte la última vez,
// dolor moderado que al día siguiente estaba peor, o dolor moderado las dos últimas veces,
// porque bajar la carga no bastó. Pasado ese plazo
// vuelven, más suaves (ver progressSlot).
export function strongPainIds(history: WorkoutSession[], now = Date.now()): string[] {
  const levels = new Map<string, number[]>(); // dolor máximo por sesión, de la más reciente hacia atrás
  const since = now - 14 * 24 * 3600 * 1000;
  for (const s of history) {
    if (Date.parse(s.finishedAt) < since) continue;
    for (const id of new Set(s.sets.map((l) => l.exerciseId))) {
      const seen = levels.get(id) ?? [];
      if (seen.length >= 2) continue;
      const pain = Math.max(...s.sets.filter((l) => l.exerciseId === id).map(painOf));
      // Si al día siguiente la molestia estaba peor, cuenta como dolor fuerte.
      seen.push(pain >= 2 && s.painFollowUp === 'worse' ? 3 : pain);
      levels.set(id, seen);
    }
  }
  return [...levels]
    .filter(([, [last, before]]) => last === 3 || (last >= 2 && before != null && before >= 2))
    .map(([id]) => id);
}

// Dolor fuerte en un ejercicio de piernas: toda la semana siguiente, Fuerza va sin sentadillas
// ni zancadas. Solo en Fuerza: el trabajo de lesión y la elongación siguen ayudando a la rodilla.
export function legsRestIds(exercises: Exercise[], history: WorkoutSession[], now = Date.now()): string[] {
  const since = dayDate('mon', new Date(now)).getTime() - 7 * 24 * 3600 * 1000;
  const recent = history.filter((s) => Date.parse(s.finishedAt) >= since);
  const legs = exercises.filter((e) => patternFamily(e) === 'legs').map((e) => e.id);
  return strongPainIds(recent, now).some((id) => legs.includes(id)) ? legs : [];
}

// Ejercicios que la persona marcó «No puedo hacerlo» en el último ciclo (4 semanas): no se
// proponen hasta que pase, y en su lugar entra uno más simple.
// Cuánto dura depende del motivo: si no conocía el ejercicio, vuelve a las 2 semanas (ya vio la
// técnica); si estaba muy difícil o no se sintió segura, un ciclo; si el lugar no se lo permitía,
// un ciclo o hasta que cambie su perfil (equipamiento o lugar), lo que pase primero.
const DAY_MS = 24 * 3600 * 1000;
const CANT_DO_DAYS: Record<CantDoReason, number> = { dont_know: 14, too_hard: 28, not_safe: 28, no_place: 28 };
export function cantDoIds(history: WorkoutSession[], now = Date.now(), profileUpdatedAt?: string): string[] {
  const profileAt = profileUpdatedAt ? Date.parse(profileUpdatedAt) : NaN;
  const ids = history.flatMap((s) => {
    const at = Date.parse(s.finishedAt);
    return (s.cantDo ?? [])
      .filter((c) => at >= now - CANT_DO_DAYS[c.reason] * DAY_MS)
      .filter((c) => c.reason !== 'no_place' || !(profileAt > at))
      .map((c) => c.exerciseId);
  });
  return [...new Set(ids)];
}

// Lo que no se propone por ahora: dolor fuerte o repetido y lo que no pudo hacer.
export const avoidedIds = (history: WorkoutSession[], profileUpdatedAt?: string) => [
  ...strongPainIds(history),
  ...cantDoIds(history, Date.now(), profileUpdatedAt),
];

const withoutPainful = (profile: LocalProfile, history: WorkoutSession[]): LocalProfile => ({
  ...profile,
  excludedExerciseIds: [...profile.excludedExerciseIds, ...avoidedIds(history, trainingStamp(profile))],
});

// Última molestia registrada en el ejercicio: con dolor, la semana del bloque no exige más.
export const hadPain = (id: string, history: WorkoutSession[]) => {
  const last = history.find((s) => s.sets.some((l) => l.exerciseId === id));
  return !!last?.sets.some((l) => l.exerciseId === id && painOf(l) > 0);
};

export const lastWeightOf = (id: string, history: WorkoutSession[]) =>
  history.flatMap((s) => s.sets).find((l) => l.exerciseId === id && l.weightKg != null && !l.format)?.weightKg ?? null;

// Avanzado: el remate rota su forma de densidad en cada bloque, y la semana de máxima intensidad la duplica.
function densityFinisher(slot: ExerciseSlot, e: Exercise, cycle: CycleInfo): ExerciseSlot {
  const steps = cycle.week === 3 ? 2 : 1;
  const lessRest = Math.max(minRest(slot), slot.restSec - LADDER_REST_DOWN * steps);
  const format = (cycle.block - 1) % 3;
  const reps = slot.reps && Math.min(e.prescription.repRange?.max ?? Infinity, slot.reps + DENSITY_REPS_UP * steps);
  const canAddWork = slot.durationSec != null || reps !== slot.reps;
  if (format === 0 || (format === 1 && !canAddWork)) {
    return { ...slot, restSec: lessRest, rationale: 'Remate con densidad: menos descanso entre vueltas.' };
  }
  if (format === 1) {
    return {
      ...slot,
      reps,
      durationSec: slot.durationSec && slot.durationSec + DENSITY_SEC_UP * steps,
      rationale: 'Remate con densidad: más trabajo con el mismo descanso.',
    };
  }
  return {
    ...slot,
    sets: slot.sets + 1,
    restSec: lessRest,
    rationale: 'Remate con densidad: una vuelta más, con menos descanso.',
  };
}

// Semana del bloque sobre un ejercicio de Fuerza ya progresado.
export function applyCycleWeek(
  slot: ExerciseSlot,
  prescribed: ExerciseSlot,
  e: Exercise,
  profile: LocalProfile,
  cycle: CycleInfo,
  history: WorkoutSession[],
  previousBlock: Set<string>,
): ExerciseSlot {
  const pain = hadPain(e.id, history);
  // La descarga aplica siempre; con dolor se conserva el aviso sobre la molestia.
  if (cycle.week === 4) {
    const lighter = (a: number | null, b: number | null) => (a != null && b != null ? Math.min(a, b) : a);
    return {
      ...slot,
      reps: lighter(slot.reps, prescribed.reps),
      weightKg: lighter(slot.weightKg, prescribed.weightKg),
      rationale: pain
        ? 'Semana de descarga: más suave por la molestia que marcaste.'
        : 'Semana de descarga: menos volumen para recuperarte.',
    };
  }
  // Con dolor, si quedó muy pesado o si le pareció mucho, la semana del bloque no exige más.
  if (pain || wasTooHard(e.id, history) || feltTooMuch(e.id, history)) return slot;
  if (profile.level === 'advanced' && slot.role === 'C' && e.complexityLevel <= DENSITY_MAX_COMPLEXITY) {
    return densityFinisher(slot, e, cycle);
  }
  const heavier = weightsFor(e, profile)
    .filter((w) => w > (slot.weightKg ?? Infinity))
    .sort((a, b) => a - b)[0];
  const minReps = e.prescription.repRange?.min ?? 1;
  if (cycle.week === 3) {
    // Principiante: la semana de máxima intensidad es técnica, nunca más peso (ni el que subiría por progresión).
    if (profile.level === 'beginner') {
      const lastWeight = lastWeightOf(e.id, history);
      const raised = lastWeight != null && slot.weightKg != null && slot.weightKg > lastWeight;
      return {
        ...slot,
        weightKg: raised ? lastWeight : slot.weightKg,
        reps: raised ? (e.prescription.repRange?.max ?? slot.reps) : slot.reps,
        rationale: `Semana de máxima intensidad: ${slot.weightKg != null ? 'mismo peso, ' : ''}prioridad a la técnica.`,
      };
    }
    // Con un salto grande (de 12 a 16 kg es un 33 %) no se sube de golpe: se mantiene la pesa y la
    // semana exige con tempo y menos descanso. El peso sube por los peldaños de la progresión.
    const bigJump = heavier != null && slot.weightKg != null && heavier > slot.weightKg * BIG_JUMP;
    if (heavier != null && !bigJump) {
      const reps = slot.reps && Math.max(minReps, slot.reps - CHOQUE_REPS_DOWN);
      return {
        ...slot,
        sets: Math.max(POWER_MIN_SETS - 1, slot.sets - 1),
        weightKg: heavier,
        reps,
        rationale: `Semana de máxima intensidad: subimos a ${heavier} kg${reps !== slot.reps ? ' con menos repeticiones' : ''}.`,
      };
    }
    if (slot.role === 'A') return { ...slot, rationale: 'Semana de máxima intensidad: máxima calidad y velocidad.' };
    return {
      ...slot,
      restSec: Math.max(minRest(slot), Math.round(slot.restSec * CHOQUE_REST)),
      rationale:
        slot.durationSec != null
          ? 'Semana de máxima intensidad: descansa menos.'
          : 'Semana de máxima intensidad: baja en 4 s y descansa menos.',
    };
  }
  // Primer peldaño del bloque nuevo: mismo ejercicio, un paso más arriba que antes.
  if (cycle.week === 1 && cycle.block > 1 && previousBlock.has(e.id)) {
    // Igual que en la semana 3: un salto grande de pesa no se da de golpe, ni al empezar un ciclo.
    const jump = heavier != null && slot.weightKg != null && heavier > slot.weightKg * BIG_JUMP;
    if (heavier != null && !jump) {
      return { ...slot, weightKg: heavier, rationale: `Nuevo ciclo: subimos a ${heavier} kg.` };
    }
    const same = slot.weightKg != null ? 'mismo peso' : 'mismo ejercicio';
    if (cycle.block % 2 || slot.durationSec != null) {
      return {
        ...slot,
        restSec: Math.max(minRest(slot), slot.restSec - LADDER_REST_DOWN),
        rationale: `Nuevo ciclo: ${same} con menos descanso.`,
      };
    }
    return { ...slot, rationale: `Nuevo ciclo: ${same}, baja en 4 s para sumar tensión.` };
  }
  return slot;
}

// Ajustar series, reps y peso según lo que el usuario registró y la semana del bloque.
function applyProgression(
  d: DayPlan,
  cfg: DayConfig | undefined,
  profile: LocalProfile,
  exercises: Exercise[],
  history: WorkoutSession[],
  cycle: CycleInfo,
  locked: string[] = [],
) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const previousBlock = previousBlockExercises(history, cycle);
  const painful = strongPainIds(history);
  const swappedFamilies = locked.filter((id) => painful.includes(id)).map((id) => patternFamily(byId.get(id)!));
  return {
    ...d,
    blocks: d.blocks
      .map((b) => ({
        ...b,
        slots: b.slots.map((s) => {
          const e = byId.get(s.exerciseId)!;
          const progressed = progressSlot(s, e, profile, history);
          if (
            b.type === 'main_strength' &&
            !locked.includes(s.exerciseId) &&
            swappedFamilies.includes(patternFamily(e))
          ) {
            return { ...progressed, rationale: 'Cambiado por el dolor que marcaste.' };
          }
          const cycled = b.type === 'main_strength' && !cfg?.gentleStrength;
          return cycled ? applyCycleWeek(progressed, s, e, profile, cycle, history, previousBlock) : progressed;
        }),
      }))
      .map((b) =>
        b.type === 'main_strength' && cfg ? { ...b, slots: capMainTime(b.slots, cfg, profile.level, cycle) } : b,
      ),
  };
}

// Rehace un solo día con reglas. Dentro del bloque conserva los ejercicios de Fuerza
// (`lockedIds`), salvo que el dolor, el lugar o el equipamiento obliguen a cambiarlos.
export function generateDayByRules(
  cfg: DayConfig,
  otherDays: DayPlan[],
  profile: LocalProfile,
  exercises: Exercise[],
  history: WorkoutSession[] = [],
  seed = Date.now(),
  lockedIds: string[] = [],
  weekDays: DayConfig[] = [cfg],
  rotate = false,
): DayPlan {
  const usedThisWeek = new Map<string, number>();
  for (const s of otherDays.flatMap((d) => d.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots)))
    usedThisWeek.set(s.exerciseId, (usedThisWeek.get(s.exerciseId) ?? 0) + 1);
  const p = withoutPainful(profile, history);
  const cycle = cycleInfo(history, profile.level, weekDays);
  const day = generateDay(cfg, p, exercises, usedThisWeek, seed, {
    cycle,
    intensity: cycle.preparation ? 'light' : dayIntensity(weekDays, cfg.day, profile.level),
    previousBlock: previousBlockExercises(history, cycle),
    history,
    locked: new Set(lockedIds),
    rotate,
    ...weekFocus(weekDays)[cfg.day],
  });
  return applyProgression(day, cfg, profile, exercises, history, cycle, lockedIds);
}

export function generateWeekByRules(
  week: { days: DayConfig[] },
  profile: LocalProfile,
  exercises: Exercise[],
  history: WorkoutSession[] = [],
  seed = Date.now(),
  lockedByDay: Partial<Record<DayConfig['day'], string[]>> = {},
  rotate = false,
): GeneratedWeekPlan {
  const usedThisWeek = new Map<string, number>();
  const cycle = cycleInfo(history, profile.level, week.days);
  const previousBlock = previousBlockExercises(history, cycle);
  const days = week.days
    .filter((d) => d.active)
    .map((d, i) =>
      generateDay(d, withoutPainful(profile, history), exercises, usedThisWeek, seed + i * 7919, {
        cycle,
        intensity: cycle.preparation ? 'light' : dayIntensity(week.days, d.day, profile.level),
        previousBlock,
        history,
        locked: new Set(lockedByDay[d.day]),
        rotate,
        ...weekFocus(week.days)[d.day],
        // Mismo bloque y día: mismas anclas de Fuerza, para poder medir el progreso.
        mainSeed: cycle.block * 1000 + DAYS.findIndex((x) => x.id === d.day) + 1,
      }),
    )
    .map((d) =>
      applyProgression(
        d,
        week.days.find((c) => c.day === d.day),
        profile,
        exercises,
        history,
        cycle,
        lockedByDay[d.day],
      ),
    );
  const total = days.reduce((n, d) => n + d.blocks.reduce((m, b) => m + b.slots.length, 0), 0);
  const progressed = history.length > 0;
  return {
    days,
    summary: `${days.length} días de entrenamiento, ${total} ejercicios en total, ajustados a tu nivel, equipamiento y restricciones${progressed ? ' y a tu historial' : ''}.`,
  };
}
