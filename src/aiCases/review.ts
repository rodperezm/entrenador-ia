import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { guardAiPlan } from '@/domain/aiGuard';
import { isGentle, weekLocks } from '@/domain/generator';
import type { BlockType, GeneratedWeekPlan, WorkoutSession } from '@/domain/schema';
import { A_STAGES, offZone, slotRole, unlockedA, weekFocus } from '@/domain/strength';
import { dayMinutes, MAIN_MAX_SETS } from '@/domain/timeBudget';
import { DAY_LONG, GENTLE_MAX } from '@/domain/week';
import { buildAiRequest } from '@/features/planner/aiRequest';
import { checkAiPlan } from '@/features/planner/aiCheck';
import type { AiCase } from './cases';

// Le pone nota a lo que respondió la IA en un caso fijo. Se revisa su respuesta tal como llegó,
// antes de que la app la corrija: así se mide a la IA y no a la red de seguridad de la app.
// «Grave» es algo que la app tendría que arreglar o descartar; «aviso» es calidad.

export type AiRequest = ReturnType<typeof buildAiRequest>;
export type RawPlan = {
  summary?: string;
  days?: {
    day: string;
    finisher?: { format: string; reason: string | null };
    blocks: {
      type: BlockType;
      slots: {
        exerciseId: string;
        sets: number;
        reps: number | null;
        durationSec: number | null;
        weightKg: number | null;
        restSec: number;
        rationale: string | null;
      }[];
    }[];
  }[];
};
export type Finding = { level: 'grave' | 'aviso'; day: string | null; text: string };
export type Review = {
  caseId: string;
  score: number; // 10 = sin observaciones
  findings: Finding[];
  usable: boolean; // la app pudo usar la respuesta (no cayó a las reglas)
  fixedByApp: number; // ejercicios de Fuerza que la app tuvo que cambiar o quitar
};

const PART_BLOCK = { warmup: 'warmup', prehab: 'prehab', main: 'main_strength', cooldown: 'cooldown' } as const;
// Palabras que el texto para la persona no debe traer (instrucciones de la función).
const BAD_WORDS: [RegExp, string][] = [
  [/\bbloque/i, 'dice «bloque» en vez de «ciclo»'],
  [/no est[áa] disponible/i, 'dice que un ejercicio «no está disponible»'],
  [/\b(vos|ten[ée]s|pod[ée]s|quer[ée]s|hac[ée]s)\b/i, 'no tutea (usa voseo)'],
];

export function caseRequest(c: AiCase, now = Date.now()) {
  const history = c.history(now);
  return { request: buildAiRequest(c.week, c.profile, EXERCISES, history, null, null), history };
}

export function reviewAiPlan(c: AiCase, request: AiRequest, raw: RawPlan, history: WorkoutSession[] = []): Review {
  const findings: Finding[] = [];
  const add = (level: Finding['level'], day: string | null, text: string) => findings.push({ level, day, text });
  const candidates = new Map(request.candidates.map((x) => [x.id, x]));
  const name = (id: string) => EXERCISES_BY_ID.get(id)?.name.es ?? id;
  const zones = weekFocus(c.week.days);
  const allowedA = new Set(unlockedA(request.cycle.stage));
  const ballistics = new Set(A_STAGES.slice(1).flat()); // la etapa 1 es peso muerto: no es balístico

  for (const asked of request.week) {
    const label = DAY_LONG[asked.day];
    const day = raw.days?.find((d) => d.day === asked.day);
    if (!day) {
      add('grave', label, 'falta el día completo');
      continue;
    }
    const equipment = new Set<string>(asked.availableEquipment);
    for (const [part, type] of Object.entries(PART_BLOCK) as [keyof typeof PART_BLOCK, BlockType][]) {
      const want = asked.blocks[part];
      const slots = day.blocks.filter((b) => b.type === type).flatMap((b) => b.slots);
      if (want.enabled && !slots.length) add('grave', label, `falta la parte «${type}»`);
      if (!want.enabled && slots.length) add('grave', label, `agregó la parte «${type}», que no se pidió`);
      if (want.enabled && slots.length && Math.abs(slots.length - want.exerciseCount) > 1) {
        add('aviso', label, `«${type}»: se pidieron ${want.exerciseCount} ejercicios y entregó ${slots.length}`);
      }
      for (const s of slots) {
        const cand = candidates.get(s.exerciseId);
        if (!cand) {
          add('grave', label, `usó «${name(s.exerciseId)}», que no se le ofreció (lesión, dolor o equipamiento)`);
          continue;
        }
        if (!cand.blocks.includes(type)) add('grave', label, `«${cand.name}» no corresponde a la parte «${type}»`);
        if (!cand.equipment.every((q) => equipment.has(q))) {
          add('grave', label, `«${cand.name}» pide equipamiento que ese día no hay`);
        }
        if (c.forbidden?.includes(s.exerciseId)) add('grave', label, `usó «${cand.name}», prohibido en este caso`);
        if (ballistics.has(s.exerciseId) && !allowedA.has(s.exerciseId)) {
          add('grave', label, `«${cand.name}» es un balístico que la persona aún no se ha ganado`);
        }
        if (cand.kettlebell && type === 'main_strength' && s.weightKg == null) {
          add('aviso', label, `«${cand.name}» va sin peso indicado`);
        }
        if (!cand.kettlebell && !cand.dumbbells && s.weightKg != null) {
          add('aviso', label, `«${cand.name}» trae peso y no usa pesa`);
        }
        if ((s.reps == null) === (s.durationSec == null)) {
          add('aviso', label, `«${cand.name}» debe ir por repeticiones o por tiempo, no ambas ni ninguna`);
        }
        for (const [re, what] of BAD_WORDS) {
          if (s.rationale && re.test(s.rationale)) add('aviso', label, `explicación de «${cand.name}»: ${what}`);
        }
      }
    }

    // Fuerza: zona del día, fuerza suave, orden A-B-C, series y variantes repetidas.
    const main = day.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots);
    const known = main.flatMap((s) => {
      const e = EXERCISES_BY_ID.get(s.exerciseId);
      return e ? [{ s, e }] : [];
    });
    const focus = zones[asked.day]?.focus;
    if (focus && focus !== 'full') {
      for (const { e } of known) {
        if (offZone(e, focus)) add('grave', label, `«${e.name.es}» no es de la zona del día (${focus})`);
      }
    }
    if (asked.gentleStrength) {
      if (main.length > GENTLE_MAX) {
        add('grave', label, `fuerza suave con ${main.length} ejercicios (máximo ${GENTLE_MAX})`);
      }
      for (const { e } of known) {
        if (!isGentle(e)) add('grave', label, `«${e.name.es}» no es apto para un día de fuerza suave`);
      }
    }
    const roles = known.map(({ e }) => slotRole(e, request.cycle.stage) ?? 'B');
    if (roles.join('') !== [...roles].sort().join('')) add('aviso', label, `Fuerza fuera de orden (${roles.join('-')})`);
    const maxSets = MAIN_MAX_SETS[request.profile.level];
    for (const { s, e } of known) {
      if (s.sets > maxSets + 1) add('aviso', label, `«${e.name.es}» con ${s.sets} series (tope del nivel: ${maxSets})`);
    }
    const chains = known.map(({ e }) => e.progression.chainId).filter(Boolean);
    if (new Set(chains).size < chains.length) add('aviso', label, 'dos variantes de la misma progresión el mismo día');

    // Lesión: al menos 2 ejercicios pensados para su condición, si se le ofrecieron.
    const prehab = day.blocks.filter((b) => b.type === 'prehab').flatMap((b) => b.slots);
    const offered = request.candidates.filter((x) => x.forConditions && x.blocks.includes('prehab')).length;
    const forCondition = prehab.filter((s) => candidates.get(s.exerciseId)?.forConditions).length;
    if (prehab.length && offered >= 2 && forCondition < 2) {
      add('aviso', label, 'el trabajo de lesión trae menos de 2 ejercicios pensados para su condición');
    }

    // Cierre: HIIT o AMRAP nunca para principiantes ni en día suave.
    const format = day.finisher?.format ?? 'normal';
    if (format !== 'normal' && (request.profile.level === 'beginner' || asked.gentleStrength || !main.length)) {
      add('grave', label, `propuso cierre ${format.toUpperCase()} a quien no corresponde`);
    }
    if (format !== 'normal' && !day.finisher?.reason) add('aviso', label, 'cierre especial sin explicar por qué');

  }

  for (const d of raw.days ?? []) {
    if (!request.week.some((w) => w.day === d.day)) add('grave', null, `agregó un día que no se pidió (${d.day})`);
  }
  if (!raw.summary?.trim()) add('aviso', null, 'no explicó la semana');
  for (const [re, what] of BAD_WORDS) if (raw.summary && re.test(raw.summary)) add('aviso', null, `resumen: ${what}`);

  // Lo mismo que hace la app al recibirla: ¿la pudo usar?, ¿cuánto tuvo que corregir en Fuerza?
  let usable = true;
  let fixedByApp = 0;
  try {
    const checked = checkAiPlan({ plan: structuredClone(raw) as never }, request, c.week);
    const { lockedByDay, rotate } = weekLocks(null, request.cycle.blockStart, EXERCISES, c.week.days);
    const final: GeneratedWeekPlan = guardAiPlan(checked, {
      days: c.week.days,
      profile: c.profile,
      exercises: EXERCISES,
      history,
      lockedByDay,
      rotate,
      mainCandidates: request.candidates.filter((x) => x.blocks.includes('main_strength')).map((x) => x.id),
    });
    type Days = { day: string; blocks: { type: string; slots: { exerciseId: string }[] }[] }[];
    const mainOf = (days: Days, day: string) =>
      (days.find((d) => d.day === day)?.blocks ?? [])
        .filter((b) => b.type === 'main_strength')
        .flatMap((b) => b.slots.map((s) => s.exerciseId));
    for (const asked of request.week) {
      const kept = new Set(mainOf(final.days, asked.day));
      fixedByApp += mainOf(raw.days ?? [], asked.day).filter((id) => !kept.has(id)).length;
    }
    // Tiempo: se mide lo que la persona recibe, porque las series las termina de decidir la app según
    // la semana del ciclo. Con Fuerza se espera usar entre 80 % y 120 % de los minutos del día
    // (salvo en la semana 4, de descarga, que es más corta a propósito).
    for (const asked of request.week) {
      const got = final.days.find((d) => d.day === asked.day);
      if (!got) continue;
      const minutes = dayMinutes(got.blocks);
      const use = minutes / asked.availableMinutes;
      const strengthDay = asked.blocks.main.enabled && !asked.gentleStrength;
      const text = `${minutes} de ${asked.availableMinutes} min (${Math.round(use * 100)} %)`;
      if (strengthDay && use < 0.8 && request.cycle.week !== 4) add('aviso', DAY_LONG[asked.day], `el día queda corto: ${text}`);
      if (use > 1.2) add('aviso', DAY_LONG[asked.day], `el día se pasa: ${text}`);
    }
    if (fixedByApp) add('aviso', null, `la app tuvo que cambiar o quitar ${fixedByApp} ejercicio(s) de Fuerza`);
  } catch {
    usable = false;
    add('grave', null, 'la app descartó la respuesta completa y tuvo que armar la semana con las reglas');
  }

  const graves = findings.filter((f) => f.level === 'grave').length;
  const avisos = findings.length - graves;
  const score = Math.max(0, Math.round((10 - graves * 2 - avisos * 0.5) * 10) / 10);
  return { caseId: c.id, score, findings, usable, fixedByApp };
}
