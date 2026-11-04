import { EQUIPMENT, type EquipmentId, equipmentAt } from './catalog';
import { filterExercisesForUser } from './filter';
import type { DayPlan, Exercise, LocalProfile, WeekConfig } from './schema';
import { strengthRole } from './strength';

// Patrones principales que una semana de fuerza debería tener. Si uno no aparece en ningún
// día, se avisa con el motivo (equipamiento o lesión) y cómo resolverlo, en vez de omitirlo en silencio.

type Family = 'hinge' | 'push' | 'pull' | 'legs';

const FAMILIES: { id: Family; label: string }[] = [
  { id: 'hinge', label: 'bisagra' },
  { id: 'push', label: 'empuje' },
  { id: 'pull', label: 'tirón' },
  { id: 'legs', label: 'piernas' },
];

const familyOf = (e: Exercise): Family | null => {
  const p = e.movementPattern;
  if (p === 'hinge') return 'hinge';
  if (p === 'squat' || p === 'lunge') return 'legs';
  if (p.startsWith('push_')) return 'push';
  if (p.startsWith('pull_')) return 'pull';
  return null;
};

export type MissingPattern = { label: string; reason: string };

export function missingPatterns(
  days: DayPlan[],
  week: WeekConfig,
  profile: LocalProfile,
  exercises: Exercise[],
): MissingPattern[] {
  const strengthDays = week.days.filter((d) => d.active && d.blocks.main.enabled && !d.gentleStrength);
  if (!strengthDays.length) return [];
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const present = new Set(
    days.flatMap((d) =>
      d.blocks
        .filter((b) => b.type === 'main_strength')
        .flatMap((b) => b.slots.map((s) => byId.get(s.exerciseId)))
        .flatMap((e) => (e ? [familyOf(e)] : [])),
    ),
  );
  // Lo que podría hacer en sus lugares de entrenamiento, con y sin cada límite.
  const places = [...new Set(strengthDays.map((d) => d.location))];
  const equipment = [...new Set(places.flatMap((p) => equipmentAt(p, profile)))];
  const options = (p: Pick<LocalProfile, 'equipment' | 'conditions'>, family: Family) =>
    filterExercisesForUser(exercises, { ...profile, ...p }, 'main_strength').filter(
      (e) => strengthRole(e) != null && familyOf(e) === family,
    );

  return FAMILIES.filter((f) => !present.has(f.id)).flatMap((f) => {
    if (options({ equipment, conditions: profile.conditions }, f.id).length) return []; // hay opciones: no faltó por eso
    const allEquipment = Object.keys(EQUIPMENT) as EquipmentId[];
    const withAll = options({ equipment: allEquipment, conditions: profile.conditions }, f.id);
    if (withAll.length) {
      // El equipamiento que más ejercicios abriría.
      const counts = new Map<EquipmentId, number>();
      withAll.forEach((e) =>
        e.equipment.required
          .filter((q) => !equipment.includes(q))
          .forEach((q) => counts.set(q, (counts.get(q) ?? 0) + 1)),
      );
      const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
      const fixed = best === 'pullup_bar' || best === 'parallel_bars';
      const how = best
        ? fixed
          ? `Si en tu parque hay ${EQUIPMENT[best].toLowerCase()}, agrégalo a tu parque en Mi perfil.`
          : `Con ${EQUIPMENT[best].toLowerCase()} tendrías opciones. Si lo tienes, agrégalo a tu equipamiento en Mi perfil.`
        : 'Con otro equipamiento tendrías opciones.';
      return [{ label: f.label, reason: `Tu equipamiento no tiene ejercicios de ${f.label}. ${how}` }];
    }
    return [
      {
        label: f.label,
        reason: `Lo que marcaste evitar por tu lesión deja fuera los ejercicios de ${f.label}. Si mejoras, revísalo en Mi perfil.`,
      },
    ];
  });
}
