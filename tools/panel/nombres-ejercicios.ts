// Genera marketing/Panel/ejercicios.json: el nombre de cada ejercicio por su id.
// El panel recibe de la base solo ids; con este archivo los muestra con nombre.
// Volver a ejecutarlo cuando cambie el catálogo:
//   npx tsx tools/panel/nombres-ejercicios.ts
import { writeFileSync } from 'node:fs';
import { EXERCISES } from '../../src/data/exercises.seed';

const names = Object.fromEntries(
  [...EXERCISES].sort((a, b) => a.id.localeCompare(b.id)).map((e) => [e.id, e.name.es]),
);
writeFileSync('marketing/Panel/ejercicios.json', JSON.stringify(names, null, 1) + '\n');
console.log(`${Object.keys(names).length} ejercicios`);
