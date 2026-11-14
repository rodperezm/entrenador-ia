import { MEDICAL_CONDITIONS } from '@/domain/catalog';
import type { DayOfWeek, LocalProfile, WeekConfig, WorkoutSession } from '@/domain/schema';
import {
  applyDayChoice,
  CARE_DAY,
  type DayChoice,
  defaultWeekConfig,
  STRENGTH_DAY,
  withGentleStrength,
} from '@/domain/week';

// Casos fijos para probar a la IA: personas inventadas, siempre las mismas, que se le envían antes
// y después de cada cambio (instrucciones, modelo o lo que se le manda) para comparar las respuestas.
// No son personas reales ni usan datos de nadie.

export type AiCase = {
  id: string;
  name: string;
  why: string; // qué se quiere vigilar con este caso
  profile: LocalProfile;
  week: WeekConfig;
  history: (now: number) => WorkoutSession[];
  // Ejercicios que no pueden aparecer en ninguna parte de la semana.
  forbidden?: string[];
};

const DAY = 864e5;

const person = (p: Partial<LocalProfile>): LocalProfile =>
  ({
    name: null,
    sex: 'male',
    birthDate: '1986-05-10',
    heightCm: 172,
    level: 'intermediate',
    equipment: ['kettlebell', 'mat', 'chair'],
    parkEquipment: [],
    kettlebellWeightsKg: [12, 16],
    kettlebellPairsKg: [],
    dumbbellWeightsKg: [],
    dumbbellPairsKg: [],
    conditions: [],
    excludedExerciseIds: [],
    healthAlerts: [],
    disclaimerAcceptedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p,
  }) as LocalProfile;

const condition = (conditionId: string) => ({
  conditionId,
  activeFlags: MEDICAL_CONDITIONS.find((m) => m.id === conditionId)!.suggestedFlags,
  notes: null,
});

type DaySetup = { parts: DayChoice; minutes?: number; park?: boolean; gentle?: boolean };
const weekOf = (setup: Partial<Record<DayOfWeek, DaySetup>>): WeekConfig => ({
  days: defaultWeekConfig().days.map((cfg) => {
    const s = setup[cfg.day];
    if (!s) return applyDayChoice(cfg, []);
    const day = applyDayChoice(
      { ...cfg, location: s.park ? 'park' : 'home', availableMinutes: s.minutes ?? 45, gentleStrength: false },
      s.parts,
    );
    return s.gentle ? withGentleStrength(day) : day;
  }),
});
const strength = (minutes = 45, extra: Partial<DaySetup> = {}): DaySetup => ({ parts: STRENGTH_DAY, minutes, ...extra });

// Una sesión pasada con un solo ejercicio de fuerza, para dar historial a un caso.
const session = (
  now: number,
  daysAgo: number,
  exerciseId: string,
  set: { reps: number; weightKg: number | null; rpe: number; painLevel?: number },
  extra: Partial<WorkoutSession> = {},
): WorkoutSession => {
  const t = new Date(now - daysAgo * DAY).toISOString();
  return {
    id: `caso-${exerciseId}-${daysAgo}`,
    day: 'mon',
    location: 'home',
    startedAt: t,
    finishedAt: t,
    completed: true,
    sets: [1, 2, 3].map((setNo) => ({
      exerciseId,
      setNo,
      targetReps: set.reps,
      repsDone: set.reps,
      durationSec: null,
      weightKg: set.weightKg,
      rpe: set.rpe,
      painFlag: (set.painLevel ?? 0) >= 2,
      painLevel: set.painLevel ?? 0,
      techniqueOk: true,
    })),
    ...extra,
  } as WorkoutSession;
};

// Semanas completas ya entrenadas, sin dolor, para que el caso esté dentro de su ciclo. Una persona
// recién llegada está en «preparación» y esa semana la arman las reglas: a la IA nunca le llega.
const trainedWeeks = (now: number, weeks: number, perWeek: number, exerciseId = 'kb_deadlift'): WorkoutSession[] => {
  const today = new Date(now);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7), 10);
  const out: WorkoutSession[] = [];
  for (let w = weeks; w >= 1; w--) {
    for (let i = 0; i < perWeek; i++) {
      const at = monday.getTime() - w * 7 * DAY + i * DAY;
      const daysAgo = (now - at) / DAY;
      out.push(session(now, daysAgo, exerciseId, { reps: 8, weightKg: 12, rpe: 7 }, { id: `caso-base-${w}-${i}` }));
    }
  }
  return out.reverse(); // lo más reciente primero, como en la app
};

export const AI_CASES: AiCase[] = [
  {
    id: 'rodilla',
    name: 'Rodilla lesionada',
    why: 'Con dolor patelofemoral no puede haber saltos, impacto, flexión profunda cargada ni apoyo de rodillas, y el día de lesión debe trabajar la rodilla.',
    profile: person({ kettlebellExperience: 'basic', conditions: [condition('patellofemoral_pain')] }),
    week: weekOf({ mon: strength(), wed: { parts: CARE_DAY, minutes: 25 }, fri: strength() }),
    history: (now) => trainedWeeks(now, 1, 3, 'kb_deadlift'),
  },
  {
    id: 'principiante',
    name: 'Principiante total',
    why: 'Sin condición física ni kettlebell: parte por el peso muerto, sin swing ni balísticos, con pocas series y sin cierres HIIT o AMRAP.',
    profile: person({ level: 'beginner', kettlebellExperience: 'none', sex: 'female', kettlebellWeightsKg: [8] }),
    week: weekOf({ tue: strength(30), thu: strength(30) }),
    history: (now) => trainedWeeks(now, 1, 2, 'kb_deadlift'),
  },
  {
    id: 'atleta-sin-kettlebell',
    name: 'Atleta que nunca usó kettlebell',
    why: 'Buena condición física pero cero técnica con la pesa: puede exigirse en peso corporal, pero con kettlebell parte como principiante.',
    profile: person({ level: 'advanced', kettlebellExperience: 'none', kettlebellWeightsKg: [12, 16, 20] }),
    week: weekOf({ mon: strength(60), tue: strength(60), thu: strength(60), fri: strength(60) }),
    history: (now) => trainedWeeks(now, 2, 4, 'kb_deadlift'),
  },
  {
    id: 'lumbar-fuerza-suave',
    name: 'Dolor lumbar con día de fuerza suave',
    why: 'El día marcado como fuerza suave lleva como máximo 2 ejercicios sencillos, sin balísticos, y la prioridad es la lesión.',
    profile: person({ kettlebellExperience: 'basic', conditions: [condition('low_back_pain')] }),
    week: weekOf({
      mon: strength(),
      wed: { parts: ['warmup', 'prehab', 'cooldown'], minutes: 35, gentle: true },
      fri: strength(),
    }),
    history: (now) => trainedWeeks(now, 1, 3, 'glute_bridge'),
  },
  {
    id: 'dolor-fuerte-reciente',
    name: 'Dolor fuerte en un ejercicio la semana pasada',
    why: 'Un ejercicio que dolió fuerte no puede volver esta semana, y uno que quedó muy pesado no puede subir de carga.',
    profile: person({ kettlebellExperience: 'skilled', kettlebellWeightsKg: [12, 16, 20] }),
    week: weekOf({ mon: strength(), wed: strength(), fri: strength() }),
    history: (now) => [
      ...trainedWeeks(now, 1, 3, 'kb_deadlift'),
      session(now, 3, 'kb_goblet_squat', { reps: 8, weightKg: 16, rpe: 8, painLevel: 3 }),
      session(now, 4, 'kb_floor_press', { reps: 8, weightKg: 16, rpe: 10 }, { feeling: 'too_much' }),
    ],
    forbidden: ['kb_goblet_squat'],
  },
  {
    id: 'parque-sin-barra',
    name: 'Un día en el parque, sin barra',
    why: 'Cada día solo puede usar el equipamiento que hay donde entrena: en el parque no hay silla ni barra de dominadas.',
    profile: person({ kettlebellExperience: 'basic', equipment: ['kettlebell', 'mat', 'chair', 'pullup_bar'] }),
    week: weekOf({ mon: strength(), wed: strength(45, { park: true }), sat: strength() }),
    history: (now) => trainedWeeks(now, 3, 3, 'kb_deadlift'),
  },
];
