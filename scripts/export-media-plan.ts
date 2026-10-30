/// <reference types="node" />
// Exporta el catálogo con una propuesta de formato visual por ejercicio
// (imagen 2D, 2D animada, 3D animada o video real) para planificar las imágenes.
// Uso: npx tsx scripts/export-media-plan.ts <salida.json>
import { writeFileSync } from 'node:fs';
import { EQUIPMENT, MUSCLES } from '../src/domain/catalog';
import { EXERCISES } from '../src/data/exercises.seed';
import type { Exercise } from '../src/domain/schema';

const PATTERN_ES: Record<Exercise['movementPattern'], string> = {
  squat: 'Sentadilla',
  hinge: 'Bisagra de cadera',
  lunge: 'Zancada / una pierna',
  push_horizontal: 'Empuje horizontal',
  push_vertical: 'Empuje vertical',
  pull_horizontal: 'Tirón horizontal',
  pull_vertical: 'Tirón vertical',
  carry: 'Acarreo',
  core_anti_extension: 'Core anti-extensión',
  core_anti_rotation: 'Core anti-rotación',
  core_flexion: 'Core flexión',
  core_rotation: 'Core rotación',
  isolation_arm: 'Brazos (aislamiento)',
  calf: 'Pantorrilla',
  cardio: 'Cardio',
  mobility: 'Movilidad',
  stretch: 'Estiramiento',
  balance: 'Equilibrio',
};

// Vista de cámara que mejor muestra la técnica de cada patrón.
const VIEW: Partial<Record<Exercise['movementPattern'], string>> = {
  squat: 'Lateral + frontal',
  hinge: 'Lateral',
  lunge: 'Lateral + frontal',
  push_horizontal: 'Lateral',
  push_vertical: 'Frontal + lateral',
  pull_horizontal: 'Lateral',
  pull_vertical: 'Posterior + lateral',
  carry: 'Frontal',
  core_rotation: 'Frontal',
};

const isBallistic = (e: Exercise) => e.restrictionFlags.includes('ballistic') || e.restrictionFlags.includes('jumping');
const TECHNICAL = new Set([
  'kb_turkish_get_up',
  'kb_half_tgu',
  'kb_windmill',
  'kb_renegade_row',
  'kb_complex',
  'kb_bottoms_up_press',
]);

function format(e: Exercise): { format: string; why: string; priority: string } {
  const timed = e.prescription.mode === 'time';
  if (e.mechanics === 'stretch')
    return {
      format: 'Imagen 2D (1–2 poses)',
      why: 'Postura sostenida: basta ver la posición final.',
      priority: 'Baja',
    };
  if (
    timed &&
    ['core_anti_extension', 'core_anti_rotation', 'balance'].includes(e.movementPattern) &&
    !TECHNICAL.has(e.id)
  )
    return { format: 'Imagen 2D (1–2 poses)', why: 'Isometría: lo importante es la alineación.', priority: 'Baja' };
  if (e.mechanics === 'mobility' || e.mechanics === 'cardio' || e.blockTypes.every((b) => b === 'warmup'))
    return { format: '2D animada (loop corto)', why: 'Movimiento simple y repetitivo.', priority: 'Baja' };
  if (isBallistic(e) || TECHNICAL.has(e.id))
    return {
      format: 'Video real + 3D animada',
      why: 'Técnico o explosivo: el ritmo y el golpe de cadera se entienden mejor en video real.',
      priority: 'Alta',
    };
  if (e.movementPattern === 'carry')
    return { format: '2D animada (loop corto)', why: 'Caminar con la pesa: postura y agarre.', priority: 'Media' };
  return {
    format: '3D animada',
    why: 'Fuerza con rango de movimiento: conviene ver ángulos y alineación.',
    priority: e.equipment.required.includes('kettlebell') ? 'Alta' : 'Media',
  };
}

function strengthBlock(e: Exercise): string {
  if (!e.blockTypes.includes('main_strength')) return '';
  if (e.tags.includes('finisher')) return 'C · Finisher';
  if (isBallistic(e)) return 'A · Potencia';
  return 'B · Fuerza';
}

const rows = EXERCISES.map((e, i) => {
  const f = format(e);
  return {
    n: i + 1,
    id: e.id,
    name: e.name.es,
    warmup: e.blockTypes.includes('warmup'),
    prehab: e.blockTypes.includes('prehab'),
    strength: e.blockTypes.includes('main_strength'),
    cooldown: e.blockTypes.includes('cooldown'),
    block: strengthBlock(e),
    pattern: PATTERN_ES[e.movementPattern],
    level: e.complexityLevel,
    sides: e.laterality === 'bilateral' ? 'Bilateral' : e.laterality === 'unilateral' ? 'Un lado' : 'Alternado',
    equipment: e.equipment.required.map((q) => EQUIPMENT[q]).join(', ') || 'Peso corporal',
    muscles: e.anatomy.primary.map((m) => MUSCLES[m.muscle].label).join(', '),
    steps: e.instructions.steps.length,
    format: f.format,
    why: f.why,
    view: e.mechanics === 'stretch' ? 'La que muestre la postura' : (VIEW[e.movementPattern] ?? 'Frontal'),
    priority: f.priority,
  };
});

writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
console.log(rows.length, 'ejercicios');
