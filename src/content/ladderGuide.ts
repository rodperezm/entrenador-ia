import { LADDER, LADDER_LENGTH } from '@/domain/ladder';

// Material didáctico de la fila técnica (domain/ladder): los textos que aprobó Rodrigo el 25-11-2026.
// Son los mismos de la infografía de Canva «KETTAI · Tu camino con la kettlebell (15 pasos)», de la web
// y de las historias: si cambia uno, cambia en todos lados.

export type LadderCard = { purpose: string; cue: string };

// En el orden de LADDER (paso 1 primero).
export const LADDER_CARDS: LadderCard[] = [
  {
    purpose: 'Es la base del peso muerto, el swing y todo lo que viene después.',
    cue: 'La cadera va hacia atrás, no hacia abajo; la espalda, recta.',
  },
  {
    purpose: 'Levantar peso del suelo con la cadera y no con la espalda.',
    cue: 'La pesa sube pegada al cuerpo; arriba, glúteos apretados.',
  },
  {
    purpose: 'Fuerza de piernas y aprender a sostener la pesa frente al pecho.',
    cue: 'Codos por dentro de las rodillas, pecho alto.',
  },
  {
    purpose: 'Fuerza de espalda, para equilibrar todo lo que empujas.',
    cue: 'Lleva el codo hacia el bolsillo de atrás, sin girar el tronco.',
  },
  {
    purpose: 'Aprender el péndulo del swing sin la parte explosiva.',
    cue: 'Lanza la pesa alto entre las piernas, cerca de la ingle, sin pararte del todo.',
  },
  {
    purpose: 'El primer golpe de cadera, de a uno y con control.',
    cue: 'La fuerza sale de la cadera, no de los brazos; cada repetición parte desde el suelo.',
  },
  {
    purpose: 'El movimiento madre de la kettlebell: potencia, glúteos y corazón.',
    cue: 'Golpe de cadera y brazos como cuerdas; arriba, el cuerpo recto como una tabla.',
  },
  {
    purpose: 'Fuerza de hombros y llevar la pesa sobre la cabeza con seguridad.',
    cue: 'Sube la pesa al hombro con las dos manos; aprieta glúteos y abdomen al empujar.',
  },
  {
    purpose: 'Agarrar con una mano sin que el cuerpo se tuerza. Prepara el swing a una mano.',
    cue: 'Hombros nivelados; no te inclines hacia la pesa.',
  },
  {
    purpose: 'La potencia del swing, ahora resistiendo el giro del cuerpo.',
    cue: 'Hombros cuadrados, mirando al frente; la mano libre acompaña el movimiento.',
  },
  {
    purpose: 'Estabilidad de hombro y de todo el cuerpo, del suelo hasta quedar de pie.',
    cue: 'Lento, brazo estirado y los ojos siempre en la pesa.',
  },
  {
    purpose: 'Llevar la pesa del suelo al hombro de forma explosiva.',
    cue: 'La pesa va pegada al cuerpo y rodea la mano, sin golpear el antebrazo.',
  },
  {
    purpose: 'Unir dos movimientos que ya dominas en uno de cuerpo completo.',
    cue: 'Una pausa en el hombro antes de empujar; no lances la pesa hacia arriba.',
  },
  {
    purpose: 'La primera mitad del snatch: el impulso hacia arriba.',
    cue: 'Después del golpe de cadera, el codo va hacia atrás y alto, y la pesa sube hasta el pecho.',
  },
  {
    purpose: 'El movimiento más completo: del suelo a sobre la cabeza en un solo gesto.',
    cue: 'Solo cuando dominas el clean y el press; la pesa rodea la mano, sin golpear.',
  },
];

// Los 4 tramos de la infografía: desde qué paso empieza cada uno.
export const LADDER_STAGES = [
  { name: 'Base', from: 1 },
  { name: 'El swing', from: 5 },
  { name: 'Fuerza y control', from: 8 },
  { name: 'Explosivos', from: 12 },
];

// Cómo se gana el paso siguiente (la línea «Siguiente paso» de cada ficha).
export function ladderEarnText(step: number) {
  if (step >= LADDER_LENGTH) return 'Llegaste: ahora se abren las variantes (push press, jerk, swing con dos pesas).';
  if (step === 1) return `Hazla bien en 2 entrenamientos y pasas al ${LADDER[1].name.toLowerCase()}.`;
  const { minWeeks } = LADDER[step - 1];
  if (minWeeks === 0) return '2 entrenamientos marcando «Pude mantener la técnica», sin dolor. Se puede ganar en la misma semana.';
  return `2 entrenamientos marcando «Pude mantener la técnica», sin dolor, y al menos ${
    minWeeks === 1 ? '1 semana' : `${minWeeks} semanas`
  } de práctica.`;
}

export const LADDER_RULES = [
  'Si sientes dolor, bajas un paso. Lo ganado no se pierde: vuelves a subir.',
  'Todo entrenamiento con trabajo de cadera parte con la bisagra en el calentamiento.',
];
