import { EXERCISES_BY_ID } from '@/data/exercises.seed';
import { isGentle } from '@/domain/generator';
import { GeneratedWeekPlan, type WeekConfig } from '@/domain/schema';
import { slotRole, sortByRole } from '@/domain/strength';
import { fitPart } from '@/domain/timeBudget';
import { GENTLE_MAX } from '@/domain/week';
import type { buildAiRequest } from './aiRequest';

// Sin conexión ni cuenta: así se puede probar sin la IA (ver src/aiCases).

export class AiPlanError extends Error {
  constructor(
    message: string,
    readonly code = '',
  ) {
    super(message);
  }
}

// Revisión de lo que devolvió Claude, aparte de la llamada para poder probarla sin la IA.
export function checkAiPlan(
  data: { plan?: { summary?: unknown; days?: { day?: unknown }[] } },
  request: ReturnType<typeof buildAiRequest>,
  week: WeekConfig,
) {
  // Validar contra el esquema de la app y contra los candidatos enviados.
  const locations = new Map(week.days.map((d) => [d.day, d.location]));
  const parsed = GeneratedWeekPlan.safeParse({
    summary: data?.plan?.summary,
    days: (data?.plan?.days ?? []).map((d) => ({
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
          return e ? { ...s, role: slotRole(e, request.cycle.stage) ?? 'B' } : s;
        }),
      );
    }
    for (const b of d.blocks) {
      const asked = request.week.find((w) => w.day === d.day);
      // Semana dividida por zonas: el remate (brazos, core, accesorios) es parte del día y no se quita por poco.
      const zoned = b.type === 'main_strength' && !!asked && 'focus' in asked;
      b.slots = fitPart(BLOCK_KEY[b.type], b.slots, cfg, request.profile.level, request.cycle, asked?.intensity, zoned);
    }
  }

  return parsed.data;
}
