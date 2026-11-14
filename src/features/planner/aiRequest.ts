import { equipmentAt, MEDICAL_CONDITIONS, RESTRICTION_FLAGS } from '@/domain/catalog';
import { kettlebellLevel, usesKettlebell } from '@/domain/experience';
import { trainingStamp } from '@/domain/profileStamp';
import { zoneLabel } from '@/domain/checkIn';
import { cycleGuide, cycleInfo, previousBlockExercises } from '@/domain/cycle';
import { effortKind, effortNote } from '@/domain/effort';
import { filterExercisesForUser } from '@/domain/filter';
import {
  avoidedIds,
  legsRestIds,
  MAX_COMPLEXITY as KETTLEBELL_MAX_COMPLEXITY,
  recentExerciseIds,
  weekLocks,
} from '@/domain/generator';
import { wasTooHard } from '@/domain/progression';
import { dayIntensity, unlockedA, focusGuide, strengthRole, weekFocus } from '@/domain/strength';
import { leadPart, partBudgets, partCount } from '@/domain/timeBudget';
import { DAY_PARTS } from '@/domain/week';
import {
  type BlockType,
  type Exercise,
  type LocalProfile,
  painOf,
  type StoredWeekPlan,
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
  plan: StoredWeekPlan | null = null,
) {
  const forConditions = new Set(
    profile.conditions.flatMap((c) => MEDICAL_CONDITIONS.find((m) => m.id === c.conditionId)?.prehabExerciseIds ?? []),
  );

  // Candidatos: por cada bloque, lo que el usuario puede hacer en ese bloque, en casa o en el
  // parque (cada día dice qué equipamiento tiene disponible).
  // Con dolor fuerte reciente o si lo marcó «No puedo hacerlo», el ejercicio ni siquiera se le ofrece a la IA.
  const anywhere = {
    ...profile,
    equipment: [...new Set([...profile.equipment, ...equipmentAt('park', profile)])],
    excludedExerciseIds: [...profile.excludedExerciseIds, ...avoidedIds(history, trainingStamp(profile))],
  };
  const allowed = new Map<string, Set<BlockType>>();
  for (const block of BLOCKS) {
    for (const e of filterExercisesForUser(exercises, anywhere, block)) {
      if (!allowed.has(e.id)) allowed.set(e.id, new Set());
      allowed.get(e.id)!.add(block);
    }
  }
  // En Fuerza solo entran patrones principales y los balísticos de la etapa alcanzada.
  const cycle = cycleInfo(history, profile, week.days);
  const allowedA = unlockedA(cycle.stage);
  const fitsStrength = (e: Exercise) =>
    allowedA.includes(e.id) ||
    strengthRole(e) === 'B' ||
    (strengthRole(e) === 'C' && !e.restrictionFlags.includes('ballistic'));
  const resting = legsRestIds(exercises, history);
  // Con la experiencia declarada, los ejercicios de kettlebell más difíciles que su manejo de la pesa
  // ni siquiera se le ofrecen a la IA (las reglas aplican el mismo tope).
  const tooTechnical = (e: Exercise) =>
    !!profile.kettlebellExperience &&
    usesKettlebell(e) &&
    !allowedA.includes(e.id) &&
    e.complexityLevel > KETTLEBELL_MAX_COMPLEXITY[kettlebellLevel(profile)];
  for (const e of exercises) {
    if (!fitsStrength(e) || resting.includes(e.id) || tooTechnical(e)) allowed.get(e.id)?.delete('main_strength');
  }

  const candidates = exercises
    .filter((e) => allowed.has(e.id) && allowed.get(e.id)!.size > 0)
    .map((e) => ({
      id: e.id,
      name: e.name.es,
      blocks: [...allowed.get(e.id)!],
      muscleGroups: e.muscleGroups,
      primaryMuscles: e.anatomy.primary.map((m) => m.muscle),
      pattern: e.movementPattern,
      strengthRole: strengthRole(e),
      complexity: e.complexityLevel,
      kettlebell: e.equipment.required.includes('kettlebell'),
      equipment: e.equipment.required,
      laterality: e.laterality,
      kettlebells: e.kettlebellCount,
      dumbbells: e.dumbbellGuide?.count ?? 0,
      chain: e.progression.chainId,
      defaults: {
        sets: e.prescription.sets,
        repRange: e.prescription.repRange,
        durationSec: e.prescription.durationSec,
        restSec: e.prescription.restSec,
      },
      suggestedKgByLevel: e.dumbbellGuide?.suggestedWeightKg ?? e.kettlebellGuide?.suggestedWeightKg ?? null,
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
      name: byId.get(id)?.name.es ?? id, // con dolor fuerte no está en candidatos: sin esto la IA deduce el nombre del id
      date: s.finishedAt.slice(0, 10),
      tooHard: wasTooHard(id, history),
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
          ...(l.format ? { format: l.format } : {}),
          ...(l.painSide ? { painSide: { left: 'izquierdo', right: 'derecho', both: 'ambos' }[l.painSide] } : {}),
        })),
    }));
  });

  // Dentro del ciclo: misma semana, se conserva la Fuerza; semana nueva, solo las anclas y el resto rota.
  const { lockedByDay: fixedByDay, rotate } = weekLocks(plan, cycle.blockStart, exercises, week.days);

  return {
    cycle: {
      ...cycle,
      guide: cycleGuide(cycle, profile),
      previousBlockExercises: [...previousBlockExercises(history, cycle)],
      fixedByDay,
      // true: fixedByDay son solo las anclas del día; el resto de main_strength rota respecto de la semana pasada.
      rotateOthers: rotate,
    },
    profile: {
      level: profile.level,
      // Condición física en "level"; manejo de la kettlebell aparte (null = no declarado, usar "level").
      kettlebellExperience: profile.kettlebellExperience ?? null,
      sex: profile.sex,
      age: ageFrom(profile.birthDate),
      heightCm: profile.heightCm,
      equipment: profile.equipment,
      kettlebellWeightsKg: profile.kettlebellWeightsKg,
      kettlebellPairsKg: profile.kettlebellPairsKg,
      dumbbellWeightsKg: profile.dumbbellWeightsKg,
      dumbbellPairsKg: profile.dumbbellPairsKg,
      conditions: profile.conditions.map((c) => ({
        name: MEDICAL_CONDITIONS.find((m) => m.id === c.conditionId)?.name ?? c.conditionId,
        avoid: c.activeFlags.map((f) => RESTRICTION_FLAGS[f]),
      })),
    },
    week: week.days
      .filter((d) => d.active)
      .map(({ active: _active, ...d }) => ({
        ...d,
        // La cantidad de ejercicios de cada parte la calcula la app con los minutos (salvo que la persona la fije).
        blocks: Object.fromEntries(
          DAY_PARTS.map((p) => [
            p,
            { ...d.blocks[p], exerciseCount: partCount(p, { ...d, active: true }, profile.level) },
          ]),
        ) as typeof d.blocks,
        availableEquipment: equipmentAt(d.location, profile),
        intensity: dayIntensity(week.days, d.day, profile.level),
        // Con 4 a 6 días de Fuerza la semana se divide por zonas: cada día dice cuál le toca y cómo se arma.
        ...(() => {
          const zone = weekFocus(week.days)[d.day];
          const guide = zone && focusGuide(zone.focus, zone.turn);
          return zone && guide ? { focus: zone.focus, focusGuide: guide } : {};
        })(),
        leadPart: leadPart({ ...d, active: true }),
        minutesByPart: Object.fromEntries(
          Object.entries(partBudgets({ ...d, active: true }, profile.level)).map(([part, sec]) => [
            part,
            Math.round(sec / 60),
          ]),
        ),
      })),
    candidates,
    history: lastByExercise,
    // Lo que hizo en los últimos 8 días: calentamiento, lesión y elongación deben variar respecto de esto.
    recentExercises: [...recentExerciseIds(history)],
    // Lo que dijo la persona: cómo llegó, cómo se sintió tras calentar, cómo estuvo y cómo amaneció.
    recentFeelings: history.slice(0, HISTORY_SESSIONS).flatMap((s) =>
      s.checkIn || s.feeling || s.painFollowUp
        ? [
            {
              date: s.finishedAt.slice(0, 10),
              arrival: s.checkIn?.arrival ?? null,
              painZone: s.checkIn?.painZone ? zoneLabel(s.checkIn.painZone) : null,
              painAtArrival: s.checkIn?.painLevel ? ['', 'leve', 'moderado', 'fuerte'][s.checkIn.painLevel] : null,
              afterWarmup: s.checkIn?.afterWarmup ?? null,
              feeling: s.feeling ?? null,
              painNextDay: s.painFollowUp ?? null,
              completed: s.completed,
            },
          ]
        : [],
    ),
    // Cierres recientes y cómo le fue, para elegir el de esta semana con su evolución.
    recentFinishers: history.slice(0, HISTORY_SESSIONS).flatMap((s) => {
      const sets = s.sets.filter((l) => l.format);
      const format = sets[0]?.format;
      if (!format) return [];
      const rpes = sets.map((l) => l.rpe).filter((v): v is number => v != null);
      return [
        {
          date: s.finishedAt.slice(0, 10),
          format,
          effortRpe: rpes.length ? Math.max(...rpes) : null,
          pain: ['nada', 'leve', 'moderado', 'fuerte'][Math.max(...sets.map(painOf))],
          ...(format === 'hiit' ? { intervals: sets.length } : {}),
          ...(s.amrap
            ? {
                amrap: {
                  minutes: s.amrap.minutes,
                  exercises: s.amrap.exerciseIds.map((id) => byId.get(id)?.name.es ?? id),
                  rounds: s.amrap.rounds,
                  extraReps: s.amrap.extraReps,
                  // Mejor marca anterior del mismo desafío, para saber si mejoró.
                  previousBest:
                    history
                      .filter(
                        (o) =>
                          o.finishedAt < s.finishedAt &&
                          o.amrap?.minutes === s.amrap!.minutes &&
                          o.amrap.exerciseIds.join(',') === s.amrap!.exerciseIds.join(','),
                      )
                      .map((o) => o.amrap!)
                      .sort((a, b) => b.rounds * 1000 + b.extraReps - (a.rounds * 1000 + a.extraReps))[0] ?? null,
                },
              }
            : {}),
        },
      ];
    }),
    body,
  };
}
