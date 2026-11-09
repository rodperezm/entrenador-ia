import { MEDICAL_CONDITIONS, MUSCLE_GROUP_LABELS, type MuscleGroupId, MUSCLES, type MuscleId } from './catalog';
import { dayNeeds, MOVEMENT_LABEL, prepares, stretchesMuscle } from './coverage';
import type { CycleInfo } from './cycle';
import { recentExerciseIds } from './generator';
import { lastSessionOf } from './progression';
import type { DayConfig, DayPlan, Exercise, ExerciseSlot, LocalProfile, WorkoutSession } from './schema';
import { weightLabel } from './sides';
import { anchorIds, type Intensity, isArmAccessory } from './strength';

// Por qué la semana y el día son como son. Lo arma la app con los datos reales (semana del ciclo,
// lo que hizo la última vez, lo que trabaja cada día), así nunca dice algo que no pasó.

type Family = 'hinge' | 'legs' | 'push' | 'pull' | 'core' | 'carry';
const FAMILY_LABEL: Record<Family, string> = {
  hinge: 'Bisagra (cadera)',
  legs: 'Piernas (sentadilla y zancada)',
  push: 'Empuje',
  pull: 'Tirón',
  core: 'Core',
  carry: 'Acarreo',
};
const familyOf = (e: Exercise): Family | null => {
  const p = e.movementPattern;
  if (p === 'hinge') return 'hinge';
  if (p === 'squat' || p === 'lunge') return 'legs';
  if (p.startsWith('push_')) return 'push';
  if (p.startsWith('pull_')) return 'pull';
  if (p === 'carry') return 'carry';
  if (p.startsWith('core')) return 'core';
  return null;
};

// Los movimientos base del método con kettlebell.
const KB_CORE = new Set([
  'kb_deadlift',
  'kb_dead_stop_swing',
  'kb_swing_2h',
  'kb_swing_1h',
  'kb_clean',
  'kb_press',
  'kb_half_kneeling_press',
  'kb_goblet_squat',
  'kb_front_squat',
  'kb_snatch',
  'kb_clean_press',
  'kb_jerk',
  'kb_turkish_get_up',
  'kb_half_tgu',
  'kb_row',
]);

const PURPOSE: Record<CycleInfo['week'], string> = {
  1: 'Partimos con técnica y peso cómodo: el cuerpo aprende los movimientos antes de exigirle.',
  2: 'Subimos el volumen de a poco: más series o repeticiones en tus ejercicios ancla.',
  3: 'La semana más exigente del ciclo: más peso si tienes una kettlebell mayor; si no, más tensión.',
  4: 'Descarga: bajamos el volumen para que el cuerpo asimile lo trabajado y llegues fresco al próximo ciclo.',
};

const join = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;

const doseLabel = (exerciseId: string, sets: number, reps: number | null, sec: number | null, kg: number | null) =>
  `${sets} × ${reps ?? `${sec ?? 0} s`}${kg ? ` · ${weightLabel(exerciseId, kg)}` : ''}`;

export type ExerciseChange = {
  name: string;
  before: string | null;
  now: string;
  note: string | null;
  tag: 'anchor' | 'new' | 'back' | null; // ancla del ciclo, primera vez o vuelve tras unos días
  sinceStart: string | null; // en las anclas: la dosis de la primera sesión del ciclo
};
export type WeekExplanation = {
  title: string;
  purpose: string;
  why: string[];
  changes: ExerciseChange[];
  works: string[];
};

export function explainWeek(input: {
  days: DayPlan[];
  cycle: CycleInfo;
  history: WorkoutSession[];
  exercises: Exercise[];
}): WeekExplanation {
  const { days, cycle, history } = input;
  const byId = new Map(input.exercises.map((e) => [e.id, e]));
  const mainSlots = days.flatMap((d) => d.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots));
  const strengthDays = days.filter((d) => d.blocks.some((b) => b.type === 'main_strength' && b.slots.length));

  const title = cycle.preparation
    ? 'Semana de preparación'
    : `Semana ${cycle.week} de 4 · ${cycle.weekName} · Ciclo ${cycle.block}, foco ${cycle.phaseName}`;
  const purpose = cycle.preparation
    ? 'Hasta el lunes, días de técnica para empezar el ciclo con buena base. La primera semana del ciclo la arma la IA.'
    : PURPOSE[cycle.week];

  // Anclas: el ejercicio de potencia y el principal de piernas de cada día. Se mantienen todo el ciclo
  // para medir el avance; el resto de la Fuerza rota cada semana dentro de los mismos patrones.
  const anchors = new Set(
    strengthDays.flatMap((d) =>
      anchorIds(d.blocks.find((b) => b.type === 'main_strength')?.slots ?? [], byId),
    ),
  );
  const recent = recentExerciseIds(history);
  const mainIds = [...new Set(mainSlots.map((s) => s.exerciseId))];
  const fresh = recent.size ? mainIds.filter((id) => !anchors.has(id) && !recent.has(id)) : [];
  const nameOf = (id: string) => byId.get(id)?.name.es ?? id;

  const why: string[] = [];
  if (strengthDays.length) {
    if (cycle.week === 1 && cycle.block > 1) {
      why.push(
        'Ciclo nuevo: eliges nuevas anclas con los mismos patrones de movimiento; el ejercicio de potencia sigue su progresión.',
      );
    }
    if (anchors.size) {
      why.push(
        `Anclas del ciclo: ${join([...anchors].map(nameOf))}. Se mantienen las 4 semanas para medir tu avance: lo que cambia es la carga.`,
      );
      why.push(
        'El resto de la Fuerza rota cada semana con los mismos patrones (empuje, tirón, piernas y bisagra), para que entrenes todo el cuerpo sin que sea siempre lo mismo.',
      );
    }
    if (fresh.length) {
      why.push(`Distinto a la semana pasada en Fuerza: ${join(fresh.map(nameOf))}.`);
    }
    const arms = mainIds.filter((id) => byId.get(id) && isArmAccessory(byId.get(id)!));
    if (arms.length) {
      why.push(`Brazos (bíceps y tríceps): ${join(arms.map(nameOf))}, como remate al final de la Fuerza.`);
    }
  }
  // Variedad real: cuántos ejercicios de apoyo no hizo en los últimos días.
  if (recent.size) {
    const support = days.flatMap((d) => d.blocks.filter((b) => b.type !== 'main_strength').flatMap((b) => b.slots));
    const freshSupport = support.filter((s) => !recent.has(s.exerciseId)).length;
    if (support.length) {
      why.push(
        `${freshSupport} de ${support.length} ejercicios de calentamiento, lesión y elongación son distintos a los de la semana pasada. Cambian los ejercicios, no el objetivo: siempre preparan y estiran lo que trabajas ese día.`,
      );
    }
  }

  // Qué cambia en cada ejercicio de Fuerza frente a lo que hizo la última vez.
  const seen = new Set<string>();
  const changes: ExerciseChange[] = [];
  // Dosis de un registro de sesión, para comparar.
  const doseOf = (id: string, logs: WorkoutSession['sets']) => {
    const plain = logs.filter((l) => !l.format);
    if (!plain.length) return null;
    const reps = Math.max(...plain.map((l) => l.targetReps ?? l.repsDone ?? 0)) || null;
    const sec = Math.max(...plain.map((l) => l.durationSec ?? 0)) || null;
    const kg = Math.max(...plain.map((l) => l.weightKg ?? 0)) || null;
    return doseLabel(id, plain.length, reps, sec, kg);
  };
  // Lo hecho en este ciclo, de la sesión más antigua a la más reciente.
  const blockHistory = history.filter((h) => h.finishedAt.slice(0, 10) >= cycle.blockStart).reverse();
  for (const s of mainSlots) {
    if (seen.has(s.exerciseId)) continue;
    seen.add(s.exerciseId);
    const e = byId.get(s.exerciseId);
    if (!e) continue;
    const last = lastSessionOf(s.exerciseId, history);
    const now = doseLabel(s.exerciseId, s.sets, s.reps, s.durationSec, s.weightKg);
    const before = last ? doseOf(s.exerciseId, last.logs) : null;
    const anchor = anchors.has(s.exerciseId);
    const first = anchor ? lastSessionOf(s.exerciseId, blockHistory) : null;
    const start = first && first.session !== last?.session ? doseOf(s.exerciseId, first.logs) : null;
    changes.push({
      name: e.name.es,
      before,
      now,
      note: s.rationale,
      tag: anchor ? 'anchor' : !last ? 'new' : fresh.includes(s.exerciseId) ? 'back' : null,
      sinceStart: start,
    });
  }

  // Qué trabaja la semana: patrones por días, grupos musculares y movimientos base con kettlebell.
  const familyDays = new Map<Family, number>();
  for (const d of strengthDays) {
    const fams = new Set(
      d.blocks
        .filter((b) => b.type === 'main_strength')
        .flatMap((b) => b.slots)
        .flatMap((s) => {
          const e = byId.get(s.exerciseId);
          const f = e && familyOf(e);
          return f ? [f] : [];
        }),
    );
    fams.forEach((f) => familyDays.set(f, (familyDays.get(f) ?? 0) + 1));
  }
  const works: string[] = [];
  if (familyDays.size) {
    works.push(
      'Cuerpo completo: ' +
        join([...familyDays].map(([f, n]) => `${FAMILY_LABEL[f].toLowerCase()} ${n} ${n === 1 ? 'día' : 'días'}`)) +
        '.',
    );
  }
  const groups = [...new Set(mainSlots.flatMap((s) => byId.get(s.exerciseId)?.muscleGroups ?? []))] as MuscleGroupId[];
  if (groups.length) works.push(`Grupos musculares: ${join(groups.map((g) => MUSCLE_GROUP_LABELS[g].toLowerCase()))}.`);
  const kb = [...new Set(mainSlots.map((s) => s.exerciseId))].filter((id) => KB_CORE.has(id));
  if (kb.length) {
    works.push(`Movimientos base con kettlebell: ${join(kb.map((id) => byId.get(id)!.name.es))}.`);
  }

  return { title, purpose, why, changes, works };
}

const INTENSITY_NOTE: Record<Intensity, string> = {
  intense: 'Día fuerte: la dosis completa de la semana.',
  moderate: 'Día moderado: una serie menos, para recuperarte entre días exigentes.',
  light: 'Día suave: técnica y movimiento, sin buscar más carga.',
};

// Por qué cada parte del día tiene lo que tiene, en una línea por parte.
export function explainDay(input: {
  dayPlan: DayPlan;
  cfg: DayConfig;
  profile: LocalProfile;
  exercises: Exercise[];
  intensity: Intensity | null;
}): string[] {
  const { dayPlan, cfg, profile } = input;
  const byId = new Map(input.exercises.map((e) => [e.id, e]));
  const block = (type: DayPlan['blocks'][number]['type']) => dayPlan.blocks.find((b) => b.type === type)?.slots ?? [];
  const ex = (s: ExerciseSlot) => byId.get(s.exerciseId);
  const main = block('main_strength');
  const lines: string[] = [];

  if (main.length && input.intensity && !cfg.gentleStrength) lines.push(INTENSITY_NOTE[input.intensity]);

  const families = [...new Set(main.flatMap((s) => (ex(s) ? [familyOf(ex(s)!)] : [])).filter((f): f is Family => !!f))];
  // Calentamiento y elongación se explican con lo que de verdad cubren, no con lo que se esperaba.
  const exList = (slots: ExerciseSlot[]) => slots.flatMap((s) => ex(s) ?? []);
  const needs = dayNeeds(exList(main));
  const warm = block('warmup');
  if (warm.length) {
    const ready = needs.movements.filter((m) => exList(warm).some((e) => prepares(e, m)));
    const missing = needs.movements.filter((m) => !ready.includes(m));
    lines.push(
      main.length && needs.movements.length
        ? `Calentamiento · ${warm.length}: ${
            ready.length
              ? `cada movimiento de la Fuerza de hoy tiene su preparación: ${join(ready.map((m) => MOVEMENT_LABEL[m]))}`
              : 'entrada en calor general'
          }${missing.length ? `; ${join(missing.map((m) => MOVEMENT_LABEL[m]))} no tiene uno específico hoy` : ''}. Cada ejercicio dice qué prepara.`
        : `Calentamiento · ${warm.length}: suave, para entrar en calor sin cargar la zona que cuidas.`,
    );
  }

  const prehab = block('prehab');
  if (prehab.length) {
    const own = new Set(
      profile.conditions.flatMap(
        (c) => MEDICAL_CONDITIONS.find((m) => m.id === c.conditionId)?.prehabExerciseIds ?? [],
      ),
    );
    const names = profile.conditions
      .map((c) => MEDICAL_CONDITIONS.find((m) => m.id === c.conditionId)?.name.toLowerCase())
      .filter(Boolean) as string[];
    const ownCount = prehab.filter((s) => own.has(s.exerciseId)).length;
    const rest = prehab.length - ownCount;
    const owned =
      ownCount === prehab.length
        ? `todos son los indicados para ${join(names)}.`
        : `${ownCount} ${ownCount === 1 ? 'es el indicado' : 'son los indicados'} para ${join(names)} y ${rest} más ${rest === 1 ? 'trabaja' : 'trabajan'} la misma zona, para variar.`;
    lines.push(
      names.length
        ? `Lesión · ${prehab.length}: ${owned}`
        : `Movilidad · ${prehab.length}: estabilidad y movilidad para moverte mejor.`,
    );
  }

  if (main.length) {
    const byRole = (r: ExerciseSlot['role']) =>
      main.filter((s) => s.role === r).map((s) => ex(s)?.name.es ?? s.exerciseId);
    const parts = [
      byRole('A').length ? `potencia con ${join(byRole('A'))}` : null,
      byRole('B').length ? `fuerza con ${join(byRole('B'))}` : null,
      byRole('C').length ? `un remate opcional con ${join(byRole('C'))}` : null,
    ].filter(Boolean) as string[];
    lines.push(
      cfg.gentleStrength
        ? `Fuerza suave · ${main.length}: ejercicios sencillos, sin balísticos, para cuidar tu lesión.`
        : `Fuerza · ${main.length}: ${join(parts)}. Cubre ${join(families.map((f) => FAMILY_LABEL[f].toLowerCase()))}.`,
    );
  }

  const cool = block('cooldown');
  if (cool.length) {
    // El músculo que más trabajó cada ejercicio de Fuerza (o de Lesión, si no hubo Fuerza).
    const key = dayNeeds(exList(main.length ? main : prehab)).topMuscles;
    const stretched = key.filter((m) => exList(cool).some((e) => stretchesMuscle(e, m) || stretchesMuscle(e, m, true)));
    const missing = key.filter((m) => !stretched.includes(m));
    const label = (m: MuscleId) => MUSCLES[m].label.toLowerCase();
    lines.push(
      key.length
        ? `Elongación · ${cool.length}: estira el músculo que más trabajó cada ejercicio: ${join(stretched.map(label))}${
            missing.length ? `; ${join(missing.map(label))} queda sin estiramiento propio hoy` : ''
          }.`
        : `Elongación · ${cool.length}: estiramientos generales, lentos y sin forzar.`,
    );
  }
  if ((warm.length || cool.length) && (main.length || prehab.length)) {
    lines.push(
      'Calentamiento y elongación cambian de una semana a otra para variar, pero siempre preparan y estiran lo que trabajas ese día.',
    );
  }

  const auto = !(['warmup', 'prehab', 'main', 'cooldown'] as const).some(
    (p) => cfg.blocks[p].enabled && cfg.blocks[p].fixedCount,
  );
  lines.push(
    auto
      ? `La cantidad de ejercicios de cada parte la calculó la app con tus ${cfg.availableMinutes} min y tu nivel.`
      : 'Respetamos la cantidad de ejercicios que elegiste; la app ajustó vueltas y duración a tus minutos.',
  );
  return lines;
}
