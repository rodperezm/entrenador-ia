// Simula cómo entrena una persona la semana que le armaron: qué días hace, cuánto le cuesta cada
// ejercicio (esfuerzo de 1 a 10), qué le duele y qué responde al llegar y al terminar.
// El resultado son sesiones con el mismo formato que guarda la app, para que la semana siguiente
// la IA reciba un historial realista.

import { EXERCISES_BY_ID } from '@/data/exercises.seed';
import type { GeneratedWeekPlan, SetLog, WorkoutSession } from '@/domain/schema';
import { DAYS_ORDER } from './util';
import type { Persona } from './personas';

// Azar con semilla: la misma persona en la misma semana se comporta igual en cada corrida.
export function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const DAY = 864e5;
// La capacidad se define como el peso de una sentadilla goblet de 8 repeticiones a esfuerzo 7; cada
// patrón tolera más o menos que eso (un swing o un acarreo se hace con más peso que un press).
const PATTERN_FACTOR: Record<string, number> = {
  hinge: 1.5,
  carry: 1.5,
  squat: 1,
  pull_horizontal: 1.3,
  pull_vertical: 0.8,
  push_horizontal: 1,
  push_vertical: 0.75,
  lunge: 0.7,
  isolation_arm: 0.45,
};
const round05 = (n: number) => Math.round(n * 2) / 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export type SimState = { trainedWeeks: number };

export function simulateWeek(
  persona: Persona,
  plan: GeneratedWeekPlan,
  week: number, // 0 = preparación; 1.. = semanas con IA
  monday: number,
  state: SimState,
  salt = '',
): WorkoutSession[] {
  const b = persona.behavior;
  const rand = rng(`${persona.id}|${week}|${salt}`);
  if (b.skipWeeks?.includes(week)) return [];
  const capacity = b.capacityKg * (1 + b.gainPerWeek) ** state.trainedWeeks;
  const sessions: WorkoutSession[] = [];
  const arrival = b.arrival?.(week) ?? null;

  for (const day of plan.days) {
    if (rand() > b.adherence) continue;
    const t = new Date(monday + DAYS_ORDER.indexOf(day.day) * DAY + 10 * 36e5).toISOString();
    const sets: SetLog[] = [];
    let maxRpe = 0;
    const rpes: number[] = [];
    let maxPain = 0;
    for (const block of day.blocks) {
      for (const slot of block.slots) {
        const e = EXERCISES_BY_ID.get(slot.exerciseId);
        if (!e) continue;
        const logged = block.type === 'main_strength' || block.type === 'prehab';
        let rpe: number | null = null;
        if (logged) {
          const load = slot.weightKg
            ? slot.weightKg / (capacity * (PATTERN_FACTOR[e.movementPattern] ?? 0.6))
            : 0.85 + (e.complexityLevel - 2) * 0.05;
          const volume = slot.reps != null ? (slot.reps - 8) * 0.25 : ((slot.durationSec ?? 30) - 30) / 60;
          let r = 7 + (load - 1) * 6 + volume + (rand() - 0.5);
          if (b.feelingBias === 'ganas') r -= 1.5;
          if (b.feelingBias === 'exagera') r += 1.5;
          if (arrival?.tired) r += 0.5;
          rpe = round05(clamp(r, 4, 10));
          maxRpe = Math.max(maxRpe, rpe);
          rpes.push(rpe);
        }
        let pain = 0;
        for (const rule of b.pain ?? []) {
          if (week < rule.weeks[0] || week > rule.weeks[1]) continue;
          const hits =
            (rule.flags ?? []).some((f) => e.restrictionFlags.includes(f)) ||
            (rule.patterns ?? []).includes(e.movementPattern);
          if (hits && rand() < (rule.chance ?? 1)) pain = Math.max(pain, rule.level);
        }
        maxPain = Math.max(maxPain, pain);
        const failed = rpe != null && rpe >= 10;
        for (let setNo = 1; setNo <= slot.sets; setNo++) {
          sets.push({
            exerciseId: e.id,
            setNo,
            targetReps: slot.reps,
            repsDone: slot.reps != null ? (failed && setNo === slot.sets ? Math.max(1, slot.reps - 2) : slot.reps) : null,
            durationSec: slot.durationSec,
            weightKg: slot.weightKg,
            rpe,
            painFlag: pain >= 2,
            painLevel: pain,
            techniqueOk: true,
          });
        }
      }
    }
    const meanRpe = rpes.length ? rpes.reduce((a, x) => a + x, 0) / rpes.length : 0;
    const feeling =
      b.feelingBias === 'exagera'
        ? 'too_much'
        : b.feelingBias === 'ganas'
          ? 'wanted_more'
          : meanRpe >= 9
            ? 'too_much'
            : meanRpe >= 8.2 || maxRpe >= 10
              ? 'tight'
              : meanRpe > 0 && meanRpe <= 6.3
                ? 'wanted_more'
                : 'right';
    sessions.push({
      id: `${persona.id}-s${week}-${day.day}`,
      day: day.day,
      location: day.location,
      startedAt: t,
      finishedAt: t,
      completed: !sets.some((s) => s.repsDone != null && s.targetReps != null && s.repsDone < s.targetReps),
      sets,
      ...(arrival
        ? {
            checkIn: arrival.tired
              ? { arrival: 'tired' as const, afterWarmup: 'tired' as const }
              : { arrival: 'pain' as const, painZone: arrival.painZone, painLevel: arrival.painLevel },
          }
        : { checkIn: { arrival: 'normal' as const, afterWarmup: 'activated' as const } }),
      feeling,
      ...(maxPain >= 2 ? { painFollowUp: b.painNextDay ?? 'better' } : {}),
    } as WorkoutSession);
  }
  if (sessions.length) state.trainedWeeks += sessions.length / Math.max(1, plan.days.length);
  return sessions.reverse(); // lo más reciente primero, como en la app
}
