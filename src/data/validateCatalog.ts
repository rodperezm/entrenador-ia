import { MEDICAL_CONDITIONS, MUSCLES } from '@/domain/catalog';
import type { Exercise } from '@/domain/schema';

// Comprueba la integridad referencial del catálogo (zod valida la forma;
// esto valida que los IDs referenciados existan y tengan sentido).
export function validateCatalog(exercises: Exercise[]): string[] {
  const errors: string[] = [];
  const byId = new Map<string, Exercise>();

  for (const e of exercises) {
    if (byId.has(e.id)) errors.push(`ID duplicado: ${e.id}`);
    byId.set(e.id, e);
  }

  const ref = (from: string, id: string, what: string) => {
    if (!byId.has(id)) errors.push(`${from}: ${what} "${id}" no existe`);
  };

  for (const e of exercises) {
    e.progression.next.forEach((id) => ref(e.id, id, 'progression.next'));
    e.progression.previous.forEach((id) => ref(e.id, id, 'progression.previous'));
    e.kettlebellGuide?.prerequisites.forEach((id) => ref(e.id, id, 'prerequisite'));
    if (e.kettlebellGuide?.hipHinge?.drillExerciseId) ref(e.id, e.kettlebellGuide.hipHinge.drillExerciseId, 'drill');

    for (const id of e.cooldownStretchIds) {
      ref(e.id, id, 'cooldownStretchIds');
      if (byId.has(id) && !byId.get(id)!.blockTypes.includes('cooldown')) {
        errors.push(`${e.id}: "${id}" no es un ejercicio de enfriamiento`);
      }
    }

    // Los grupos declarados deben cubrir los grupos de los músculos primarios.
    for (const { muscle } of e.anatomy.primary) {
      const group = MUSCLES[muscle].group;
      if (!e.muscleGroups.includes(group)) errors.push(`${e.id}: falta grupo "${group}" (músculo ${muscle})`);
    }

    if (e.equipment.required.includes('kettlebell') && !e.kettlebellGuide && !e.blockTypes.includes('prehab')) {
      errors.push(`${e.id}: usa kettlebell pero no tiene kettlebellGuide`);
    }
  }

  for (const c of MEDICAL_CONDITIONS) {
    c.prehabExerciseIds.forEach((id) => {
      ref(c.id, id, 'prehab');
      const ex = byId.get(id);
      if (ex && ex.restrictionFlags.some((f) => c.suggestedFlags.includes(f))) {
        errors.push(`${c.id}: el prehab "${id}" choca con las banderas sugeridas de la condición`);
      }
    });
  }

  return errors;
}
