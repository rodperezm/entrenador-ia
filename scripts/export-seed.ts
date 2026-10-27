/// <reference types="node" />
// Valida el catálogo y genera supabase/seed.sql a partir de los archivos TS.
// Uso: npm run seed
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEDICAL_CONDITIONS, MUSCLES, RESTRICTION_FLAGS } from '../src/domain/catalog';
import { EXERCISES } from '../src/data/exercises.seed';
import { validateCatalog } from '../src/data/validateCatalog';

const errors = validateCatalog(EXERCISES);
if (errors.length) {
  console.error(`Catálogo inválido (${errors.length} errores):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

const str = (v: string | null | undefined) => (v == null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const json = (v: unknown) => `${str(JSON.stringify(v))}::jsonb`;
const arr = (v: (string | number)[]) => `${str(`{${v.join(',')}}`)}`;

const lines: string[] = ['-- Generado por scripts/export-seed.ts. No editar a mano.', ''];

for (const [id, m] of Object.entries(MUSCLES)) {
  lines.push(`insert into public.muscles values (${str(id)}, ${str(m.label)}, ${str(m.group)}) on conflict (id) do update set label = excluded.label, muscle_group = excluded.muscle_group;`);
}
for (const [id, label] of Object.entries(RESTRICTION_FLAGS)) {
  lines.push(`insert into public.restriction_flags values (${str(id)}, ${str(label)}) on conflict (id) do update set label = excluded.label;`);
}

lines.push('');
for (const e of EXERCISES) {
  lines.push(
    `insert into public.exercises (id, version, name, description, block_types, muscle_groups, movement_pattern, mechanics, laterality, complexity_level, impact_level, restriction_flags, equipment_required, equipment_optional, anatomy, prescription, progression_chain_id, progression_step, progression, media, instructions, kettlebell_guide, safety_notes, cooldown_stretch_ids, tags) values (` +
      [
        str(e.id), e.version, json(e.name), json(e.description), arr(e.blockTypes), arr(e.muscleGroups),
        str(e.movementPattern), str(e.mechanics), str(e.laterality), e.complexityLevel, str(e.impactLevel),
        arr(e.restrictionFlags), arr(e.equipment.required), arr(e.equipment.optional), json(e.anatomy),
        json(e.prescription), str(e.progression.chainId), e.progression.step ?? 'null', json(e.progression),
        json(e.media), json(e.instructions), e.kettlebellGuide ? json(e.kettlebellGuide) : 'null',
        json(e.safetyNotes), arr(e.cooldownStretchIds), arr(e.tags),
      ].join(', ') +
      `) on conflict (id) do update set version = excluded.version, name = excluded.name, description = excluded.description, block_types = excluded.block_types, muscle_groups = excluded.muscle_groups, movement_pattern = excluded.movement_pattern, mechanics = excluded.mechanics, laterality = excluded.laterality, complexity_level = excluded.complexity_level, impact_level = excluded.impact_level, restriction_flags = excluded.restriction_flags, equipment_required = excluded.equipment_required, equipment_optional = excluded.equipment_optional, anatomy = excluded.anatomy, prescription = excluded.prescription, progression_chain_id = excluded.progression_chain_id, progression_step = excluded.progression_step, progression = excluded.progression, media = excluded.media, instructions = excluded.instructions, kettlebell_guide = excluded.kettlebell_guide, safety_notes = excluded.safety_notes, cooldown_stretch_ids = excluded.cooldown_stretch_ids, tags = excluded.tags, updated_at = now();`,
  );
}

// Las condiciones van al final porque referencian ejercicios de prehab.
lines.push('');
for (const c of MEDICAL_CONDITIONS) {
  lines.push(`insert into public.medical_conditions values (${str(c.id)}, ${str(c.name)}, ${arr(c.suggestedFlags)}, ${arr(c.prehabExerciseIds)}) on conflict (id) do update set name = excluded.name, suggested_flags = excluded.suggested_flags, prehab_exercise_ids = excluded.prehab_exercise_ids;`);
}

const out = join(__dirname, '..', 'supabase', 'seed.sql');
writeFileSync(out, lines.join('\n') + '\n');
console.log(`OK: ${EXERCISES.length} ejercicios, ${MEDICAL_CONDITIONS.length} condiciones → supabase/seed.sql`);
