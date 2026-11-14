/* eslint-disable @typescript-eslint/no-redeclare -- esquema zod y su tipo comparten nombre a propósito */
import { z } from 'zod';
import { BlockType, CheckIn, DayOfWeek, ExerciseSlot, PainSide, SetLog, WorkoutSession } from './schema';

// Entrenamiento en curso: lo registrado se guarda tras cada serie, para poder retomarlo si el
// sistema cierra la app a mitad de la sesión.

const PainLevel = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const Item = z.object({ key: z.string(), block: BlockType, slot: ExerciseSlot });
const Override = z.object({
  reps: z.number().optional(),
  seconds: z.number().optional(),
  weight: z.number().nullable().optional(),
});

export const WorkoutDraft = z.object({
  v: z.literal(1),
  day: DayOfWeek,
  location: z.enum(['home', 'park']),
  startedAt: z.number(), // ms: de aquí sale el id de la sesión
  savedAt: z.number(), // ms: último registro
  planGeneratedAt: z.string().nullable(), // la rutina con que se empezó
  totalSets: z.number().int().nonnegative(),
  logs: z.array(SetLog.extend({ itemKey: z.string() })),
  idx: z.number().int().nonnegative(),
  feedback: z.boolean(), // quedó en la pregunta de esfuerzo del ejercicio
  checkIn: CheckIn.nullable(),
  overrides: z.record(z.string(), Override),
  skipped: z.array(z.string()),
  itemPain: z.record(z.string(), PainLevel),
  painSides: z.record(z.string(), PainSide),
  replacements: z.record(z.string(), Item),
  modifiedKeys: z.array(z.string()),
  modifiedIds: z.array(z.string()), // los mismos, como ejercicios: así se guardan en la sesión
  cantDo: WorkoutSession.shape.cantDo,
  amrap: WorkoutSession.shape.amrap,
  markTimes: z.array(z.number()),
  closingDismissed: z.boolean(),
});
export type WorkoutDraft = z.infer<typeof WorkoutDraft>;

export function parseDraft(raw: string | null): WorkoutDraft | null {
  if (!raw) return null;
  try {
    const parsed = WorkoutDraft.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const sessionIdOf = (startedAt: number) => `s${startedAt.toString(36)}`;

const RESUME_MAX_MS = 18 * 3600 * 1000;

// Se puede retomar si es el mismo día de la semana, la misma rutina y no pasó demasiado tiempo.
// Si no, solo queda guardar lo hecho o descartarlo.
export function canResume(d: WorkoutDraft, ctx: { day: string; planGeneratedAt: string | null; now: number }) {
  return (
    d.day === ctx.day &&
    d.planGeneratedAt === ctx.planGeneratedAt &&
    ctx.now - d.savedAt < RESUME_MAX_MS &&
    ctx.now >= d.startedAt
  );
}

// Lo que alcanzó a hacer, como sesión sin terminar. Termina cuando se registró lo último.
export function sessionFromDraft(d: WorkoutDraft): WorkoutSession {
  const sets = d.logs.map(({ itemKey, ...l }) => {
    const level = Math.max(l.painLevel ?? 0, d.itemPain[itemKey] ?? 0);
    return level
      ? { ...l, painLevel: level, painFlag: level >= 2, painSide: d.painSides[itemKey] ?? l.painSide ?? null }
      : l;
  });
  return {
    id: sessionIdOf(d.startedAt),
    day: d.day,
    location: d.location,
    startedAt: new Date(d.startedAt).toISOString(),
    finishedAt: new Date(d.savedAt).toISOString(),
    completed: d.totalSets > 0 && sets.length >= d.totalSets,
    sets,
    ...(d.amrap ? { amrap: d.amrap } : {}),
    ...(d.checkIn ? { checkIn: d.checkIn } : {}),
    ...(d.cantDo?.length ? { cantDo: d.cantDo } : {}),
    ...(d.modifiedIds.length ? { modified: [...new Set(d.modifiedIds)] } : {}),
  };
}
