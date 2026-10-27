/// <reference types="node" />
// Exporta la lista de ejercicios (CSV) para pedir cotizaciones de animaciones.
// Uso: npm run exercise-list
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXERCISES } from '../src/data/exercises.seed';

const BLOCK_EN: Record<string, string> = {
  warmup: 'Warm-up',
  prehab: 'Prehab',
  main_strength: 'Strength',
  cooldown: 'Stretch / cool-down',
};

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
const rows = EXERCISES.map((e, i) =>
  [
    String(i + 1),
    e.id,
    e.name.es,
    e.blockTypes.map((b) => BLOCK_EN[b] ?? b).join(' + '),
    e.equipment.required.join(' + ') || 'bodyweight',
  ]
    .map(cell)
    .join(','),
);

const dir = join(__dirname, '..', 'docs', 'cotizacion');
mkdirSync(dir, { recursive: true });
const header = ['#', 'id', 'name (es)', 'category', 'equipment'].map(cell).join(',');
writeFileSync(join(dir, 'ejercicios.csv'), '﻿' + [header, ...rows].join('\n') + '\n');
console.log(`${rows.length} ejercicios → docs/cotizacion/ejercicios.csv`);
