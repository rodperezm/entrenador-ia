import { MUSCLES, type MuscleId } from './catalog';
import type { Exercise, ExerciseSlot, PlannedBlock } from './schema';

// La variedad cambia los ejercicios, no el objetivo: el calentamiento prepara cada movimiento de
// la Fuerza del día y la elongación estira cada músculo principal que se trabajó. Primero se cubre
// eso; recién con lo que sobra se elige por variedad.

export type Movement = 'hinge' | 'legs' | 'push' | 'pull' | 'core' | 'carry';

export const MOVEMENT_LABEL: Record<Movement, string> = {
  hinge: 'la bisagra',
  legs: 'las piernas',
  push: 'el empuje',
  pull: 'el tirón',
  core: 'el core',
  carry: 'el agarre',
};

// Músculos que tiene que despertar el calentamiento para cada movimiento.
const MOVEMENT_MUSCLES: Record<Movement, MuscleId[]> = {
  hinge: ['hamstrings', 'gluteus_maximus', 'erector_spinae'],
  legs: ['quadriceps', 'gluteus_maximus', 'adductors', 'hip_flexors', 'gluteus_medius'],
  push: ['pectoralis_major', 'deltoid_anterior', 'deltoid_lateral', 'triceps'],
  pull: ['latissimus_dorsi', 'rhomboids', 'deltoid_posterior'],
  core: ['rectus_abdominis', 'obliques', 'erector_spinae'],
  carry: ['forearms', 'trapezius', 'obliques'],
};

export function movementOf(e: Exercise): Movement | null {
  const p = e.movementPattern;
  if (p === 'hinge') return 'hinge';
  if (p === 'squat' || p === 'lunge') return 'legs';
  if (p.startsWith('push_')) return 'push';
  if (p.startsWith('pull_')) return 'pull';
  if (p === 'carry') return 'carry';
  if (p.startsWith('core')) return 'core';
  return null;
}

const primary = (e: Exercise) => e.anatomy.primary.map((m) => m.muscle);
const anyMuscle = (e: Exercise) => [...primary(e), ...e.anatomy.secondary.map((m) => m.muscle)];

// Un calentamiento prepara un movimiento si trabaja como principal alguno de sus músculos.
export const prepares = (warmup: Exercise, m: Movement) => primary(warmup).some((x) => MOVEMENT_MUSCLES[m].includes(x));

// Un estiramiento estira un músculo si es su músculo principal (o, si no hay otro, el secundario).
export const stretchesMuscle = (stretch: Exercise, muscle: MuscleId, loose = false) =>
  (loose ? anyMuscle(stretch) : primary(stretch)).includes(muscle);

// El músculo que más trabaja en un ejercicio.
export const topMuscle = (e: Exercise) =>
  [...e.anatomy.primary].sort((a, b) => b.intensity - a.intensity)[0]?.muscle ?? null;

// Lo que hay que cubrir: movimientos del día en el orden de la sesión (A primero) y músculos. Primero el
// músculo que más trabaja cada ejercicio; después, si hay espacio, el resto de los principales.
export function dayNeeds(main: Exercise[], prehab: Exercise[] = []) {
  const movements = [...new Set(main.map(movementOf).filter((m): m is Movement => !!m))];
  const worked = [...main, ...prehab];
  const top = worked.map(topMuscle).filter((m): m is MuscleId => !!m);
  const muscles = [...new Set([...top, ...worked.flatMap(primary)])];
  return { movements, muscles, topMuscles: [...new Set(top)] };
}

// Ordena las opciones para que las primeras cubran cada necesidad: por cada una, la primera opción
// (en el orden de preferencia, que ya trae la variedad) que la cubra, prefiriendo la que cubra más.
export function coverFirst<N>(
  options: Exercise[],
  needs: N[],
  covers: (e: Exercise, n: N) => boolean,
  start: Exercise[] = [],
) {
  const chosen = [...start];
  const covered = (n: N) => chosen.some((e) => covers(e, n));
  for (const need of needs) {
    if (covered(need)) continue;
    const pending = needs.filter((n) => !covered(n));
    const candidates = options.filter((e) => !chosen.includes(e) && covers(e, need));
    if (!candidates.length) continue;
    // Entre las primeras opciones (las más variadas), la que cubra más necesidades pendientes.
    const window = candidates.slice(0, 3);
    const best = window.reduce((a, b) =>
      pending.filter((n) => covers(b, n)).length > pending.filter((n) => covers(a, n)).length ? b : a,
    );
    chosen.push(best);
  }
  return [...chosen, ...options.filter((e) => !chosen.includes(e))];
}

// Para la elongación: primero el músculo principal exacto; si ningún estiramiento lo tiene como
// principal, sirve uno que lo tenga como secundario.
export function coverMuscles(options: Exercise[], muscles: MuscleId[]) {
  const strict = coverFirst(options, muscles, (e, m) => stretchesMuscle(e, m));
  const missing = muscles.filter((m) => !strict.slice(0, muscles.length).some((e) => stretchesMuscle(e, m)));
  if (!missing.length) return strict;
  const head = strict.filter((e) => muscles.some((m) => stretchesMuscle(e, m)));
  return coverFirst(options, missing, (e, m) => stretchesMuscle(e, m, true), head);
}

// Qué prepara o qué estira cada ejercicio de apoyo, para decírselo a la persona.
export function supportNote(
  slot: ExerciseSlot,
  block: PlannedBlock['type'],
  main: Exercise[],
  worked: Exercise[],
  byId: Map<string, Exercise>,
) {
  const e = byId.get(slot.exerciseId);
  if (!e) return null;
  if (block === 'warmup') {
    const hits = main.filter((m) => {
      const mv = movementOf(m);
      return mv && prepares(e, mv);
    });
    const movements = [...new Set(hits.map((m) => movementOf(m)!))];
    if (!movements.length) return main.length ? 'Entrada en calor general.' : null;
    const first = movements.map((mv) => `${MOVEMENT_LABEL[mv]} (${hits.find((h) => movementOf(h) === mv)!.name.es})`);
    return `Prepara ${joinEs(first)}.`;
  }
  if (block === 'cooldown') {
    const muscles = [...new Set(worked.flatMap(primary))].filter(
      (m) => stretchesMuscle(e, m) || stretchesMuscle(e, m, true),
    );
    if (!muscles.length) return null;
    return `Estira ${joinEs(muscles.map((m) => MUSCLES[m].label.toLowerCase()))}, que trabajaste hoy.`;
  }
  return null;
}

export const joinEs = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
