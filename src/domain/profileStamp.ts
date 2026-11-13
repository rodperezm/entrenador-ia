import type { LocalProfile } from './schema';

// Qué parte del perfil cambia la rutina. Las rutinas ya armadas se marcan «cambió» cuando cambia
// algo que las afecta (nivel, equipamiento, pesas, lesiones, ejercicios excluidos), no cuando la
// persona corrige su nombre, su fecha de nacimiento o responde las alertas médicas.
// Las alertas médicas no rehacen la rutina: solo quitan el HIIT y el AMRAP al momento de ofrecerlos.
const NOT_TRAINING: (keyof LocalProfile)[] = [
  'displayName',
  'sex',
  'birthDate',
  'heightCm',
  'healthAlerts',
  'disclaimerAcceptedAt',
  'updatedAt',
  'trainingUpdatedAt',
];

const trainingPart = (p: LocalProfile) =>
  JSON.stringify(
    Object.entries(p)
      .filter(([key]) => !NOT_TRAINING.includes(key as keyof LocalProfile))
      .sort(([a], [b]) => a.localeCompare(b)),
  );

/** Fecha del último cambio que afecta a la rutina. Los perfiles antiguos usan la fecha general. */
export const trainingStamp = (p: Pick<LocalProfile, 'updatedAt' | 'trainingUpdatedAt'>) =>
  p.trainingUpdatedAt ?? p.updatedAt;

/** La fecha que le corresponde al perfil nuevo: se conserva si lo que afecta a la rutina no cambió. */
export const nextTrainingStamp = (previous: LocalProfile | null, next: LocalProfile) =>
  previous && trainingPart(previous) === trainingPart(next) ? trainingStamp(previous) : next.updatedAt;
