import type { MuscleId, RestrictionFlagId } from './catalog';
import { equipmentAt } from './catalog';
import { filterExercisesForUser, weightsFor } from './filter';
import { prescribe } from './generator';
import {
  type BodyZone,
  type CheckIn,
  type DayPlan,
  type Exercise,
  type ExerciseSlot,
  type LocalProfile,
  painOf,
  type PlannedBlock,
  type WorkoutSession,
} from './schema';
import { MIN_REST_SEC, strengthRole } from './strength';

// «¿Cómo llegas hoy?»: manda la sensación de la persona. El plan guardado no cambia;
// solo la sesión de hoy. El cansancio no recorta al llegar: se vuelve a preguntar tras el
// calentamiento, porque muchas veces el cuerpo responde al empezar.

export const ARRIVAL_OPTIONS: { id: CheckIn['arrival']; label: string }[] = [
  { id: 'energized', label: 'Con energía' },
  { id: 'normal', label: 'Normal' },
  { id: 'tired', label: 'Cansado' },
  { id: 'pain', label: 'Con dolor o molestia' },
];

export const AFTER_WARMUP_OPTIONS: { id: NonNullable<CheckIn['afterWarmup']>; label: string }[] = [
  { id: 'activated', label: 'Me activé' },
  { id: 'tired', label: 'Sigo cansado' },
  { id: 'very_tired', label: 'Muy cansado' },
];

export const ZONES: { id: BodyZone; label: string; flags: RestrictionFlagId[]; muscles: MuscleId[] }[] = [
  {
    id: 'shoulder',
    label: 'Hombro',
    flags: ['overhead'],
    muscles: ['deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior'],
  },
  {
    id: 'elbow_wrist',
    label: 'Codo o muñeca',
    flags: ['wrist_extension_loaded', 'grip_loaded'],
    muscles: ['forearms'],
  },
  { id: 'neck', label: 'Cuello', flags: ['neck_loaded', 'overhead'], muscles: ['trapezius'] },
  {
    id: 'low_back',
    label: 'Espalda baja',
    flags: ['spinal_flexion_loaded', 'spinal_rotation_loaded', 'hip_hinge_loaded', 'ballistic'],
    muscles: ['erector_spinae'],
  },
  { id: 'hip', label: 'Cadera', flags: ['deep_hip_flexion'], muscles: ['hip_flexors', 'adductors', 'gluteus_medius'] },
  {
    id: 'knee',
    label: 'Rodilla',
    flags: ['deep_knee_flexion_loaded', 'kneeling', 'jumping', 'high_impact'],
    muscles: ['quadriceps'],
  },
  { id: 'ankle_foot', label: 'Tobillo o pie', flags: ['jumping', 'high_impact'], muscles: ['calves'] },
];

export const zoneLabel = (zone: BodyZone) => ZONES.find((z) => z.id === zone)!.label.toLowerCase();

// Un ejercicio carga la zona si tiene una de sus banderas o la trabaja como músculo principal.
// En elongación solo cuentan las banderas (apoyo de rodillas, brazos arriba): estirar el músculo ayuda.
export function loadsZone(e: Exercise, zone: BodyZone, flagsOnly = false) {
  const z = ZONES.find((x) => x.id === zone)!;
  return (
    e.restrictionFlags.some((f) => z.flags.includes(f)) ||
    (!flagsOnly && e.anatomy.primary.some((m) => z.muscles.includes(m.muscle)))
  );
}

// Con cansancio después del calentamiento o dolor moderado o fuerte, hoy no se ofrece HIIT ni AMRAP.
export const allowsFinisher = (c: CheckIn | undefined) =>
  !c || (c.afterWarmup !== 'tired' && c.afterWarmup !== 'very_tired' && (c.painLevel ?? 0) < 2);

type Context = { profile: LocalProfile; exercises: Exercise[] };

const sharedGroups = (a: Exercise, b: Exercise) => a.muscleGroups.filter((g) => b.muscleGroups.includes(g)).length;
// En Fuerza el cambio se queda en la familia del patrón: piernas (sentadilla, zancada o bisagra),
// empuje, tirón, acarreo o core. Si no hay, el ejercicio sale solo por hoy.
const family = (e: Exercise) =>
  ['squat', 'lunge', 'hinge'].includes(e.movementPattern) ? 'legs' : e.movementPattern.split('_')[0];

// Otro ejercicio del mismo bloque que no cargue la zona: primero del mismo patrón, luego de los
// mismos grupos musculares y del mismo rol, el más cercano en complejidad sin pasarla.
function alternative(
  slot: ExerciseSlot,
  block: PlannedBlock,
  zone: BodyZone,
  used: Set<string>,
  ctx: Context,
  location: DayPlan['location'],
) {
  const byId = new Map(ctx.exercises.map((e) => [e.id, e]));
  const original = byId.get(slot.exerciseId);
  if (!original) return null;
  const pool = filterExercisesForUser(
    ctx.exercises,
    { ...ctx.profile, equipment: equipmentAt(location, ctx.profile) },
    block.type,
  )
    .filter(
      (e) =>
        !used.has(e.id) &&
        !loadsZone(e, zone, block.type === 'cooldown') &&
        e.complexityLevel <= original.complexityLevel &&
        (block.type !== 'main_strength' || (strengthRole(e) != null && family(e) === family(original))),
    )
    .sort(
      (a, b) =>
        Number(b.movementPattern === original.movementPattern) -
          Number(a.movementPattern === original.movementPattern) ||
        sharedGroups(b, original) - sharedGroups(a, original) ||
        Number(strengthRole(b) === strengthRole(original)) - Number(strengthRole(a) === strengthRole(original)) ||
        b.complexityLevel - a.complexityLevel ||
        a.id.localeCompare(b.id),
    );
  const alt = pool[0];
  if (!alt) return null;
  const base = prescribe(alt, ctx.profile, `Cambio por tu molestia en ${zoneLabel(zone)}.`);
  const role = block.type === 'main_strength' ? (strengthRole(alt) ?? 'B') : undefined;
  return {
    ...base,
    sets: block.type === 'main_strength' ? slot.sets : base.sets,
    ...(role ? { role, restSec: Math.max(base.restSec, MIN_REST_SEC[role]) } : {}),
  };
}

// Dolor al llegar: leve avisa, moderado cambia lo que carga la zona y fuerte deja la zona fuera
// de Fuerza. Lesión (prehab) no se toca, porque ayuda a la zona; en elongación solo cambia lo
// que apoya o carga la zona (por ejemplo, estirar de rodillas con dolor de rodilla).
function forPain(plan: DayPlan, zone: BodyZone, level: number, ctx: Context): DayPlan {
  const byId = new Map(ctx.exercises.map((e) => [e.id, e]));
  const used = new Set(plan.blocks.flatMap((b) => b.slots.map((s) => s.exerciseId)));
  const label = zoneLabel(zone);
  const blocks = plan.blocks
    .filter((b) => !(level === 3 && b.type === 'main_strength'))
    .map((b) => {
      if (b.type === 'prehab') return b;
      const slots = b.slots.flatMap((s) => {
        const e = byId.get(s.exerciseId);
        if (!e || !loadsZone(e, zone, b.type === 'cooldown')) return [s];
        if (level === 1) return [{ ...s, rationale: `Molestia leve en ${label}: si aumenta, márcala y lo cambiamos.` }];
        const alt = alternative(s, b, zone, used, ctx, plan.location);
        if (!alt) return [];
        used.add(alt.exerciseId);
        return [alt];
      });
      return { ...b, slots };
    })
    .filter((b) => b.slots.length > 0);
  return { ...plan, blocks };
}

// Después del calentamiento, si sigue cansado: menos series; muy cansado, técnica sin balísticos.
function forFatigue(plan: DayPlan, level: 'tired' | 'very_tired', ctx: Context): DayPlan {
  const byId = new Map(ctx.exercises.map((e) => [e.id, e]));
  const blocks = plan.blocks
    .map((b) => {
      if (b.type !== 'main_strength') return b;
      const slots = b.slots.flatMap((s) => {
        const e = byId.get(s.exerciseId);
        if (level === 'tired') {
          return [
            {
              ...s,
              sets: Math.max(1, s.sets - 1),
              rationale: 'Hoy llegaste cansado: una serie menos y deja 2 o 3 repeticiones en reserva.',
            },
          ];
        }
        if (!e || e.restrictionFlags.includes('ballistic')) return [];
        const lighter =
          s.weightKg != null
            ? weightsFor(e, ctx.profile)
                .filter((w) => w < s.weightKg!)
                .sort((a, b) => b - a)[0]
            : undefined;
        return [
          {
            ...s,
            sets: Math.min(s.sets, 2),
            weightKg: lighter ?? s.weightKg,
            rationale: 'Hoy técnica y movimiento: peso cómodo y sin apurarte. Cuenta igual.',
          },
        ];
      });
      return { ...b, slots };
    })
    .filter((b) => b.slots.length > 0);
  return { ...plan, blocks };
}

const FOLLOW_UP_MS = 48 * 3600 * 1000;
const localDay = (ms: number) => new Date(ms).toDateString();

// Al día siguiente de un dolor moderado o fuerte (en la sesión o al llegar), se pregunta cómo
// amaneció. Solo la sesión más reciente con dolor, dentro de 48 horas y desde el día siguiente.
export function pendingPainFollowUp(sessions: WorkoutSession[], names: Map<string, string>, now = Date.now()) {
  const s = sessions.find((x) => now - Date.parse(x.finishedAt) < FOLLOW_UP_MS);
  if (!s || s.painFollowUp || localDay(Date.parse(s.finishedAt)) === localDay(now)) return null;
  const hurt = [...new Set(s.sets.filter((l) => painOf(l) >= 2).map((l) => names.get(l.exerciseId) ?? l.exerciseId))];
  const zone = (s.checkIn?.painLevel ?? 0) >= 2 && s.checkIn?.painZone ? zoneLabel(s.checkIn.painZone) : null;
  const where = [...(zone ? [`tu ${zone}`] : []), ...hurt.map((n) => n.toLowerCase())];
  return where.length ? { sessionId: s.id, where } : null;
}

export function adjustForCheckIn(plan: DayPlan, checkIn: CheckIn | undefined, ctx: Context): DayPlan {
  if (!checkIn) return plan;
  let adjusted = plan;
  if (checkIn.arrival === 'pain' && checkIn.painZone && checkIn.painLevel) {
    adjusted = forPain(adjusted, checkIn.painZone, checkIn.painLevel, ctx);
  }
  if (checkIn.afterWarmup === 'tired' || checkIn.afterWarmup === 'very_tired') {
    adjusted = forFatigue(adjusted, checkIn.afterWarmup, ctx);
  }
  return adjusted;
}
