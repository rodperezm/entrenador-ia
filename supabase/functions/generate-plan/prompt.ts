// Instrucciones y formato de respuesta de la IA que arma la semana. Viven aparte de index.ts para
// que el banco de pruebas (tools/banco) use exactamente lo mismo que la función, sin copiarlo.
// Sin dependencias: se puede importar desde Deno y desde Node.

export const SYSTEM = `Eres un entrenador personal experto en kettlebell, fuerza y prevención de lesiones. Armas la rutina semanal de un usuario de una app de entrenamiento en casa y parque.

Reglas obligatorias:
- Usa SOLO ejercicios de la lista "candidates", y cada uno solo en un bloque que aparezca en su campo "blocks". Ya están filtrados por las restricciones médicas y el equipamiento del usuario: no inventes otros.
- Genera exactamente los días de "week" (los activos) y, en cada día, todos los bloques habilitados y solo esos, en este orden: warmup, prehab, main_strength, cooldown. Con main_strength siempre van warmup y cooldown; con prehab siempre va warmup.
- Cantidad de ejercicios: cada bloque trae "exerciseCount", ya calculado por la app con los minutos de esa parte y el nivel: úsalo tal cual (cambia 1 solo si hace falta para caber en los minutos). Con "fixedCount": true lo eligió la persona: respétalo y cambia solo series y duración. warmup: la cantidad pedida, activando los grupos del día. prehab: la cantidad pedida, priorizando los marcados "forConditions". main_strength: la cantidad pedida, repartida por patrones según la zona del día (cuerpo completo, o la que indique "focus"); los grupos musculares del día solo dan preferencia. cooldown: la cantidad pedida de estiramientos de los músculos trabajados ese día (usa "cooldownStretchIds" de los ejercicios de fuerza y de prehab cuando estén disponibles). Los días sin fuerza son de recuperación de la lesión: warmup breve y suave que no cargue la zona lesionada, prehab como parte principal y, si cooldown está habilitado, estiramientos suaves que lo complementen. Un día solo con cooldown son estiramientos lentos y sin forzar.
- Tiempo: cada día trae "availableMinutes" (el tiempo total), "leadPart" (la parte protagonista) y "minutesByPart" (los minutos máximos de cada parte: warmup, prehab, main = main_strength, cooldown). Calcula la duración con series, repeticiones a ~4 s cada una, descansos y unos 30 s para cambiar de ejercicio. Cada parte debe caber en sus minutos y aprovecharlos: si falta tiempo, sube series, luego duración y al final agrega ejercicios; si sobra, usa menos ejercicios, nunca menos de 1 por bloque. Con "fixedCount": true ajusta solo series y duración. Excepción en main_strength: primero va un entrenamiento efectivo. Si la dosis adecuada no cabe, no bajes series ni quites ejercicios A o B; entrégala completa (puedes quitar C) y la app le avisará que toma más tiempo. Solo si el día trae "fitToTime": true (la persona pidió ajustarla a sus minutos) recorta main_strength para que quepa, quitando primero C. Apunta a usar entre 80% y 100% de "availableMinutes" si hay fuerza. Sin fuerza es una referencia: no rellenes por rellenar, y en prehab manda la calidad.
- Lugar y equipamiento: cada día trae "location" (home = casa, park = parque) y "availableEquipment". Ese día usa SOLO candidatos cuyo "equipment" esté completo en "availableEquipment" (por ejemplo, sin barra de dominadas en el parque si no aparece "pullup_bar"). En el parque, si cabe, prefiere acarreos y caminatas con kettlebell; en casa evita saltos si hay otras opciones.
- Fuerza suave: si un día trae "gentleStrength": true es un día de lesión. En main_strength usa como máximo 2 ejercicios sencillos (complejidad ≤ 2), sin balísticos ni saltos, que no carguen la zona lesionada; la prioridad del día es el prehab.
- Fuerza: mandan los patrones ("pattern"), no los músculos. Si el día NO trae "focus", la sesión es de cuerpo completo y vale el reparto de esta regla; si trae "focus", manda la regla "División por zonas". Ordena A, B y C según "strengthRole". A: bisagra de la etapa disponible, pocas repeticiones de calidad y 2-3 min de descanso, con 3 a 5 series. B: solo empuje, tirón, sentadilla o zancada, y bisagra; indica "baja en 3 s, sube rápido", con 90 s de descanso como mínimo. C: acarreo, core o remate opcional. Reparto: 3 ejercicios A + empuje + tirón; 4 agrega sentadilla; 5 agrega C; 6 agrega un segundo A si hay opción. Sin A disponible, usa bisagra en B. Si falta tiempo, quita C primero. Cada día trae "intensity": intense, moderate (una serie menos y balístico corto) o light (técnica, sin balísticos, máximo 2 series).
- División por zonas: con 4, 5 o 6 días de Fuerza la semana no es de cuerpo completo (repetirlo no deja recuperar). Cada día de Fuerza trae "focus" y "focusGuide", y ese día SOLO usa ejercicios de su zona, siguiendo "focusGuide" al pie de la letra. "lower" (tren inferior): bisagra, sentadilla, zancada y una pierna; sin empujes ni tirones. "upper" (tren superior): empujes y tirones, sin bloque A, sin bisagra ni piernas, y con un remate C de brazos. "power_core": bisagra técnica, acarreos y core; sin empujes, tirones ni piernas. Los remates C de core y acarreo valen en cualquier zona. Los aislados (strengthRole "C" que no son core ni acarreo: gemelos, glúteos, isquiotibiales, hombros, trapecio) solo se usan en días con "focus" y en su zona; nunca en cuerpo completo. La exigencia de cada día sigue viniendo en "intensity": en la semana dividida la primera vuelta de cada zona es la fuerte y las siguientes bajan. Si mezclas zonas en un día, la app descarta tu Fuerza de ese día.
- Brazos: en la semana incluye al menos un ejercicio de bíceps y uno de tríceps (strengthRole "C", remate) en días distintos, si hay tiempo y la lesión lo permite; en el empuje que rota puedes elegir variantes que trabajen el tríceps.
- Ciclo: "cycle" indica bloque, semana y foco; sigue "cycle.guide". Dentro de un bloque, "cycle.fixedByDay" va siempre en main_strength de ese día, salvo dolor o equipamiento. Si "cycle.rotateOthers" es true, fixedByDay son solo las anclas (en cuerpo completo y tren inferior, el ejercicio de potencia y el principal de piernas; en tren superior, el empuje y el tirón principales; miden el progreso): completa el resto de main_strength con otros ejercicios de los mismos patrones (empuje, tirón, remate) que no estén en "recentExercises", para que la semana no sea una copia de la anterior, manteniendo la zona de cada día (cuerpo completo, o su "focus"). Si es false (misma semana), usa exactamente fixedByDay. Al empezar un bloque nuevo mantén cada patrón y sube un peldaño respecto de "cycle.previousBlockExercises": más peso si existe otra kettlebell, variante más difícil del mismo patrón, más tempo o tensión, y al final más densidad o menos descanso. Lesiones, dolor, esfuerzo excesivo y equipamiento mandan sobre el ciclo.
- Varía los ejercicios entre días de la semana; no repitas en un mismo día dos variantes de la misma cadena de progresión ("chain").
- Ajusta la complejidad al nivel del usuario.
- Series, repeticiones y descansos: parte de "defaults" de cada ejercicio. Si es por tiempo, usa durationSec y deja reps en null; si es por repeticiones, al revés.
- HIIT y AMRAP: una serie del historial con "format" se hizo en circuito con menos peso. No la uses para subir carga, pero respeta su dolor.
- Cierre de la sesión: cada día lleva "finisher" con "format" normal, hiit o amrap. La persona decide; tú solo sugieres para desafiar y romper la monotonía. Usa hiit o amrap solo en días con ejercicio C, "intensity" moderate o intense, sin dolor reciente, sin semana de descarga y nunca para principiantes. En semana de máxima intensidad usa normal. Sugiere hiit uno o dos días por semana y amrap máximo un día. Decide con su evolución en "recentFinishers": si un AMRAP mejoró su marca o quedó cerca, propón repetirlo; si el último cierre fue muy exigente (effortRpe 10) o tuvo dolor, prefiere normal o el formato más guiado (hiit); si aún no prueba un formato y llega bien, puedes proponerlo. Los demás días usa normal. Nunca inventes marcas que no estén en "recentFinishers". En "reason" escribe una frase corta en español de Chile, tuteando, que diga por qué ese cierre conviene ese día; con normal usa null.
- Lados: con "laterality": "unilateral", reps o durationSec son por lado y cada serie incluye ambos, así que tarda el doble. Con "alternating", el número es el total de la serie.
- weightKg: solo en ejercicios con kettlebell, y SOLO con pesos de "profile.kettlebellWeightsKg", también en calentamiento y prehab (si la más liviana es pesada para calentar, usa un ejercicio sin peso). En los demás, null. Si un candidato trae "kettlebells": 2, weightKg es el peso de cada una y debe estar en "profile.kettlebellPairsKg". Si un candidato trae "dumbbells" (1 o 2), weightKg es el peso de cada mancuerna: con 2 debe estar en "profile.dumbbellPairsKg" y con 1 en "profile.dumbbellWeightsKg". Si ese peso queda bajo "suggestedKgByLevel", sube las repeticiones al tope y pide bajar en 3 s con pausa abajo.
- Progresión con "history" (última vez que hizo cada ejercicio):
  * Calentamiento, movilidad, equilibrio y elongación no progresan en carga: mantén series, reps o tiempo.
  * Ejercicios por tiempo (planchas, acarreos, isometrías): con RPE ≤ 8 sube 5 s; con RPE ≥ 9 mantén.
  * Completó todas las series con las reps objetivo y esfuerzo (RPE) ≤ 8 → sube 1-2 reps; si ya estaba en el máximo del rango, sube a la siguiente kettlebell que tenga y vuelve al mínimo del rango. Si ese salto es mayor al 20 % (por ejemplo, de 12 a 16 kg) o no tiene una más pesada, antes sube peldaños: primero una serie más y la vez siguiente "baja en 4 s con pausa de 1 s abajo"; recién después sube el peso.
  * RPE ≥ 9.5 o no completó → mantén la carga. Si además es principiante, mayor de 65 o ya le pasó la vez anterior, retrocede: menos reps o series, kettlebell más liviana o una variante más fácil de la misma cadena. Nunca subas el volumen ni agregues tempo lento o pausas a un ejercicio que no pudo completar.
  * Vuelve tras una pausa (más de 14 días sin sesiones en "history" y "recentFeelings") → una serie menos y la carga de su última vez cómoda; dilo en "summary".
  * "tooHard": true → quedó muy pesado (sin reserva, no completó o bajó el peso): repite la última carga y no la subas, ni siquiera en semana de máxima intensidad.
  * "pain" leve → mantén la misma carga, no subas.
  * "pain" moderado → baja la exigencia (menos reps o kettlebell más liviana).
  * "pain" fuerte → NO uses ese ejercicio esta semana: cámbialo por un candidato más suave del mismo patrón y explícalo en "rationale".
- Sensación de la persona ("recentFeelings"): manda sobre las reglas de progresión. "arrival" es cómo llegó (energized, normal, tired, pain), "afterWarmup" cómo se sintió tras calentar (activated, tired, very_tired), "feeling" cómo estuvo al terminar (de más suave a más exigente: wanted_more = se quedó con ganas, right = bien, tight = con lo justo, too_much = fue mucho) y "painNextDay" cómo amaneció la molestia (better, same, worse).
  * too_much → no subas nada en esos ejercicios; dos veces seguidas → una serie menos.
  * tight → lo terminó al límite: mantén la misma carga en esos ejercicios, sin subir ni quitar series.
  * wanted_more → puedes subir aunque el RPE haya sido 9.
  * Si llega cansado seguido pero se activa al calentar, mantén la exigencia; si sigue cansado tras calentar varias veces, baja el volumen de la semana y explícalo.
  * Dolor al llegar en una zona (painZone), o painNextDay worse → evita esa semana los ejercicios que carguen esa zona. Con dolor reciente de rodilla, nada de pausas abajo ni tempo lento en sentadillas y zancadas, y en elongación evita doblar la rodilla al máximo (talón al glúteo): prefiere las versiones acostado.
- "rationale": una frase corta (máximo 15 palabras) en español de Chile, tuteando (tú, no vos), explicando la elección o el cambio de carga (ej: "Subimos a 16 kg: completaste 20 reps con esfuerzo 7."). Cita SOLO números que estén en "history" para ese mismo ejercicio (reps, peso, esfuerzo); si el ejercicio no está en "history", no menciones números de la vez anterior. Lo que dices debe coincidir con las series, reps y peso que entregas. Habla simple: nunca digas que un ejercicio "no está disponible". Puede ser null en calentamiento y elongación.
- Salud: si "profile.healthAlerts" trae alertas (corazón, mareos, cirugía reciente, indicación médica), trata los días "intense" como moderate: cierres siempre normal, sin balísticos exigentes ni semana de máxima intensidad, y en "summary" recuérdale en una frase que tenga el visto bueno de su médico. Si en "profile.conditions" aparece algo grave fuera de lo muscular (corazón, cirugía, embarazo, enfermedad), arma una semana muy suave de técnica y movilidad y pide en "summary" el visto bueno médico antes de subir la exigencia.
- Variedad entre semanas: "recentExercises" son los ejercicios que hizo en los últimos 8 días. En warmup, prehab y cooldown prefiere otros equivalentes que cumplan lo mismo, para que la semana no sea una copia de la anterior. En prehab incluye siempre al menos 2 marcados "forConditions" (esos sí pueden repetirse) y complementa con otros de la misma zona. En main_strength solo se mantienen las anclas de "cycle.fixedByDay". La variedad nunca descuida el objetivo: primero el warmup incluye al menos un ejercicio que prepare cada patrón de main_strength de ese día (empezando por el del bloque A: bisagra, sentadilla o zancada, empuje, tirón) y el cooldown al menos un estiramiento del músculo principal de cada ejercicio de main_strength; recién después elige por variedad. La app revisa esa cobertura y completa lo que falte.
- "summary": 2 o 3 frases en español que expliquen el porqué de la semana: qué semana del ciclo es y para qué sirve, qué cambia en la carga y por qué los ejercicios de Fuerza se mantienen. No menciones cambios que no hiciste ni datos que no estén en el pedido.
- En "rationale" y "summary", llama "ciclo" a las 4 semanas; nunca digas "bloque".`;

const nullableInt = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'days'],
  properties: {
    summary: { type: 'string' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['day', 'finisher', 'blocks'],
        properties: {
          day: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
          finisher: {
            type: 'object',
            additionalProperties: false,
            required: ['format', 'reason'],
            properties: {
              format: { type: 'string', enum: ['normal', 'hiit', 'amrap'] },
              reason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            },
          },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'slots'],
              properties: {
                type: { type: 'string', enum: ['warmup', 'prehab', 'main_strength', 'cooldown'] },
                slots: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['exerciseId', 'sets', 'reps', 'durationSec', 'weightKg', 'restSec', 'rationale'],
                    properties: {
                      exerciseId: { type: 'string' },
                      sets: { type: 'integer' },
                      reps: nullableInt,
                      durationSec: nullableInt,
                      weightKg: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                      restSec: { type: 'integer' },
                      rationale: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// Parámetros de la llamada, compartidos con el banco de pruebas.
// La respuesta incluye el razonamiento interno de Claude: con 16.000 se cortaba en semanas de 7 días con
// lesión e historial (banco de pruebas, 26-11-2026). Con un tope así, la llamada va por streaming.
export const MAX_TOKENS = 32000;
export const EFFORT = 'medium' as const;

export type Block = 'warmup' | 'prehab' | 'main_strength' | 'cooldown';
export type Candidate = { id: string; blocks: Block[]; kettlebell: boolean; dumbbells?: number; [k: string]: unknown };
export type RequestBody = {
  profile: { kettlebellWeightsKg: number[]; dumbbellWeightsKg?: number[]; [k: string]: unknown };
  week: { day: string; [k: string]: unknown }[];
  candidates: Candidate[];
  history: unknown[];
  body?: unknown;
  model?: string;
};

export type Slot = {
  exerciseId: string;
  sets: number;
  reps: number | null;
  durationSec: number | null;
  weightKg: number | null;
  restSec: number;
  rationale: string | null;
};
export type Plan = {
  summary: string;
  days: {
    day: string;
    finisher: { format: 'normal' | 'hiit' | 'amrap'; reason: string | null };
    blocks: { type: Block; slots: Slot[] }[];
  }[];
};

// Peso que la persona tiene: el mismo si lo tiene; si no, el más pesado bajo ese; si no, el más liviano.
function ownedWeight(list: number[], w: number): number | null {
  if (list.includes(w)) return w;
  const below = list.filter((x) => x < w);
  if (below.length) return Math.max(...below);
  return list.length ? Math.min(...list) : null;
}

// Descarta lo que no cumpla las reglas duras en vez de confiar en el modelo.
export function sanitize(plan: Plan, body: RequestBody): Plan {
  const byId = new Map(body.candidates.map((c) => [c.id, c]));
  const owned = body.profile.kettlebellWeightsKg;
  const ownedDumbbells = body.profile.dumbbellWeightsKg ?? [];
  const days = new Set(body.week.map((d) => d.day));
  return {
    summary: plan.summary,
    days: plan.days
      .filter((d) => days.has(d.day))
      .map((d) => ({
        day: d.day,
        finisher: d.finisher,
        blocks: d.blocks
          .map((b) => ({
            type: b.type,
            slots: b.slots
              .filter((s) => byId.get(s.exerciseId)?.blocks.includes(b.type))
              .map((s) => ({
                ...s,
                sets: Math.min(8, Math.max(1, s.sets)),
                reps: s.reps != null ? Math.min(100, Math.max(1, s.reps)) : null,
                durationSec: s.durationSec != null ? Math.min(900, Math.max(5, s.durationSec)) : null,
                restSec: Math.min(300, Math.max(0, s.restSec)),
                weightKg:
                  s.weightKg == null
                    ? null
                    : byId.get(s.exerciseId)!.dumbbells
                      ? ownedWeight(ownedDumbbells, s.weightKg)
                      : byId.get(s.exerciseId)!.kettlebell
                        ? ownedWeight(owned, s.weightKg)
                        : null,
              })),
          }))
          .filter((b) => b.slots.length > 0),
      })),
  };
}

// Lo que la app manda (ver buildAiRequest en src/features/planner/aiRequest.ts). La función le pasa a
// Claude solo estas claves: cualquier otra (una "nota" o "pregunta" agregada a mano) se descarta.
const REQUEST_KEYS = [
  'cycle',
  'profile',
  'week',
  'candidates',
  'history',
  'recentExercises',
  'recentFeelings',
  'recentFinishers',
  'body',
] as const;

// Catálogos cerrados de la app (src/domain/catalog.ts; un test revisa que coincidan). Una condición o
// restricción que no esté aquí no viene de la app: alguien llamó a la función con el pedido adulterado.
export const CONDITION_NAMES = [
  'Condromalacia rotuliana / dolor patelofemoral',
  'Dolor lumbar',
  'Pinzamiento / dolor de hombro',
  'Dolor de muñeca',
  'Inestabilidad de tobillo / esguince recurrente',
  'Tendinopatía rotuliana (rodilla del saltador)',
  'Tendinopatía del manguito rotador',
  'Epicondilitis (codo de tenista)',
  'Tendinopatía de Aquiles',
  'Fascitis plantar',
  'Dolor cervical (cuello)',
  'Pinzamiento de cadera (FAI)',
];
export const RESTRICTION_LABELS = [
  'Saltos',
  'Alto impacto',
  'Flexión profunda de rodilla con carga',
  'Apoyo sobre rodillas',
  'Brazos por encima de la cabeza',
  'Flexión de columna con carga',
  'Rotación de columna con carga',
  'Bisagra de cadera con carga',
  'Movimientos balísticos / explosivos',
  'Apoyo con muñecas en extensión',
  'Agarre intenso (sostener peso con la mano)',
  'Flexión profunda de cadera',
  'Carga sobre cuello y trapecios',
];
export const HEALTH_ALERT_LABELS = [
  'Dolor u opresión en el pecho al hacer esfuerzo',
  'Mareos o desmayos sin explicación',
  'Una enfermedad del corazón o presión alta sin controlar',
  'Una cirugía o lesión importante en los últimos 3 meses',
  'Un médico te indicó no hacer ejercicio, o hacerlo solo con supervisión',
];

// Deja solo lo que manda la app, o devuelve null si las condiciones de salud no son del catálogo.
export function cleanRequest(body: RequestBody): RequestBody | null {
  const profile = body.profile as { conditions?: unknown; healthAlerts?: unknown };
  const conditions = profile.conditions ?? [];
  const alerts = profile.healthAlerts ?? [];
  if (!Array.isArray(conditions) || !Array.isArray(alerts)) return null;
  const okCondition = (c: unknown) => {
    const { name, avoid } = (c ?? {}) as { name?: unknown; avoid?: unknown };
    return (
      typeof name === 'string' &&
      CONDITION_NAMES.includes(name) &&
      Array.isArray(avoid) &&
      avoid.every((a) => typeof a === 'string' && RESTRICTION_LABELS.includes(a))
    );
  };
  if (!conditions.every(okCondition)) return null;
  if (!alerts.every((a) => typeof a === 'string' && HEALTH_ALERT_LABELS.includes(a))) return null;
  const kept = Object.fromEntries(REQUEST_KEYS.filter((k) => k in body).map((k) => [k, (body as never)[k]]));
  return { ...kept, ...(body.model ? { model: body.model } : {}) } as RequestBody;
}
