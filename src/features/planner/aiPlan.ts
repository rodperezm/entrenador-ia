import { FunctionsHttpError } from '@supabase/supabase-js';
import { EXERCISES_BY_ID } from '@/data/exercises.seed';
import { isGentle, sortByRole, strengthRole } from '@/domain/generator';
import { fitPart } from '@/domain/timeBudget';
import { GENTLE_MAX } from '@/domain/week';
import { GeneratedWeekPlan, type WeekConfig } from '@/domain/schema';
import type { buildAiRequest } from './aiRequest';
import { ensureSession, supabase } from '@/lib/supabase';

// Arma la rutina con Claude a través de la Edge Function "generate-plan".
// El LLM solo ve ejercicios ya filtrados por restricciones y equipamiento, y
// lo que devuelve se valida otra vez aquí antes de usarlo.

export { buildAiRequest, type BodySnapshot } from './aiRequest';

export class AiPlanError extends Error {}

const REASONS: Record<string, string> = {
  unauthorized: 'la sesión con el servidor no es válida',
  anthropic_key_invalid: 'falta o es inválida la clave de Anthropic en Supabase',
  rate_limited: 'Claude está saturado en este momento',
  refusal: 'Claude no pudo armar esta rutina',
  truncated: 'la respuesta de Claude quedó incompleta',
  anthropic_error: 'Claude tuvo un problema al responder',
};

export async function generateWeekWithAi(request: ReturnType<typeof buildAiRequest>, week: WeekConfig) {
  try {
    await ensureSession();
  } catch {
    throw new AiPlanError('no se pudo iniciar sesión en Supabase');
  }

  const { data: raw, error } = await supabase.functions.invoke('generate-plan', { body: request });
  if (error) {
    let code = '';
    if (error instanceof FunctionsHttpError) {
      code = ((await error.context.json().catch(() => ({}))) as { error?: string }).error ?? '';
    }
    throw new AiPlanError(REASONS[code] ?? 'el servidor no respondió');
  }

  // La función responde en flujo para no perder la conexión, y sus errores vienen dentro del JSON.
  // En Expo Go la respuesta no es instancia del Response global: se reconoce por tener text().
  const data = typeof raw?.text === 'function' ? await raw.text().then(JSON.parse).catch(() => null) : raw;
  if (!data || data.error) throw new AiPlanError(REASONS[data?.error] ?? 'el servidor no respondió');

  // Validar contra el esquema de la app y contra los candidatos enviados.
  const locations = new Map(week.days.map((d) => [d.day, d.location]));
  const parsed = GeneratedWeekPlan.safeParse({
    summary: data?.plan?.summary,
    days: (data?.plan?.days ?? []).map((d: { day: keyof typeof locations }) => ({
      ...d,
      location: locations.get(d.day as never) ?? 'home',
    })),
  });
  if (!parsed.success) throw new AiPlanError('la respuesta de Claude no tiene el formato esperado');

  const allowed = new Map(request.candidates.map((c) => [c.id, new Set(c.blocks)]));
  const needs = new Map(request.candidates.map((c) => [c.id, c.equipment]));
  // Equipamiento de cada día según dónde entrena (casa o parque).
  const available = new Map(request.week.map((d) => [d.day, new Set<string>(d.availableEquipment)]));
  const valid = parsed.data.days.every((d) =>
    d.blocks.every((b) => b.slots.every((s) => allowed.get(s.exerciseId)?.has(b.type))),
  );
  // Un ejercicio que no se puede hacer donde entrena ese día se quita (no se descarta la semana).
  for (const d of parsed.data.days) {
    for (const b of d.blocks) {
      b.slots = b.slots.filter((s) => (needs.get(s.exerciseId) ?? []).every((eq) => available.get(d.day)?.has(eq)));
    }
    d.blocks = d.blocks.filter((b) => b.slots.length > 0);
  }
  const activeDays = request.week.map((d) => d.day);
  const complete = activeDays.every((day) => parsed.data.days.some((d) => d.day === day && d.blocks.length > 0));
  if (!valid || !complete) throw new AiPlanError('la rutina de Claude no cumplía las reglas');

  // Respetar lo pedido aunque Claude se pase o se quede corto: minutos de cada parte del día.
  const cfgByDay = new Map(week.days.map((d) => [d.day, d]));
  const BLOCK_KEY = { warmup: 'warmup', prehab: 'prehab', main_strength: 'main', cooldown: 'cooldown' } as const;
  for (const d of parsed.data.days) {
    const cfg = cfgByDay.get(d.day);
    if (!cfg) continue;
    // Día de fuerza suave: solo ejercicios suaves y como máximo GENTLE_MAX.
    if (cfg.gentleStrength) {
      for (const b of d.blocks.filter((x) => x.type === 'main_strength')) {
        b.slots = b.slots
          .filter((s) => {
            const e = EXERCISES_BY_ID.get(s.exerciseId);
            return e != null && isGentle(e);
          })
          .slice(0, GENTLE_MAX);
      }
      d.blocks = d.blocks.filter((b) => b.slots.length > 0);
    }
    // Fuerza siempre en orden A, B y C, aunque Claude la entregue de otra forma.
    for (const b of d.blocks.filter((x) => x.type === 'main_strength')) {
      b.slots = sortByRole(
        b.slots.map((s) => {
          const e = EXERCISES_BY_ID.get(s.exerciseId);
          return e ? { ...s, role: strengthRole(e) } : s;
        }),
      );
    }
    for (const b of d.blocks) {
      b.slots = fitPart(BLOCK_KEY[b.type], b.slots, cfg, request.profile.level, request.cycle);
    }
  }

  return { plan: parsed.data, model: (data.model as string) ?? null };
}
