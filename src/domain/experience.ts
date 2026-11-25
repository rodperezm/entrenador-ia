import type { Exercise, LocalProfile } from './schema';

// El perfil separa dos cosas que antes iban juntas en «nivel»:
//   - la condición física (`level`): cuántas series, cuántos días y qué tan exigente es lo corporal;
//   - la experiencia con kettlebell (`kettlebellExperience`): dónde parte la técnica de la pesa.
// Un atleta que nunca usó kettlebell tiene condición alta y experiencia nula: mucho trabajo, pero
// la bisagra y el swing se aprenden desde el principio.
//
// Los perfiles anteriores a esta pregunta no tienen experiencia declarada: para ellos todo sigue
// saliendo del nivel, exactamente como antes.
export type Level = LocalProfile['level'];
export type KettlebellExperience = NonNullable<LocalProfile['kettlebellExperience']>;
type Who = Pick<LocalProfile, 'level' | 'kettlebellExperience'>;

const AS_LEVEL: Record<KettlebellExperience, Level> = { none: 'beginner', basic: 'intermediate', skilled: 'advanced' };

/** El nivel que vale para lo que depende de la técnica de kettlebell (dificultad, peso inicial, repeticiones). */
export const kettlebellLevel = (p: Who): Level => (p.kettlebellExperience ? AS_LEVEL[p.kettlebellExperience] : p.level);

export const usesKettlebell = (e: Pick<Exercise, 'equipment'>) => e.equipment.required.includes('kettlebell');

/** El nivel que le corresponde a un ejercicio: el de kettlebell si usa la pesa; si no, la condición. */
export const levelFor = (e: Pick<Exercise, 'equipment'>, p: Who): Level =>
  usesKettlebell(e) ? kettlebellLevel(p) : p.level;

// Paso de la fila técnica (domain/ladder) en que parte. Cada uno parte donde dice estar:
//   - «Nunca la he usado»: paso 1, la bisagra.
//   - «Conozco lo básico» (swing a dos manos y goblet con buena técnica): paso 7, el swing a dos manos.
//   - «La domino» (swing a una mano, clean y press): paso 12, con el clean ya abierto.
// Sin la pregunta respondida (perfiles antiguos), según la condición: el principiante en la bisagra
// y los demás en el swing con pausa, como antes.
const START_BY_EXPERIENCE: Record<KettlebellExperience, number> = { none: 1, basic: 7, skilled: 12 };
const START_BY_LEVEL: Record<Level, number> = { beginner: 1, intermediate: 6, advanced: 6 };
export const startStage = (p: Who) =>
  p.kettlebellExperience ? START_BY_EXPERIENCE[p.kettlebellExperience] : START_BY_LEVEL[p.level];

/** Todavía está aprendiendo la pesa: sus primeros ciclos son de foco Técnica. */
export const learningKettlebell = (p: Who) =>
  p.kettlebellExperience ? p.kettlebellExperience === 'none' : p.level === 'beginner';

/** La semana de máxima intensidad no sube de pesa: manda la técnica (por condición o por experiencia). */
export const techniqueFirst = (p: Who) => p.level === 'beginner' || p.kettlebellExperience === 'none';
