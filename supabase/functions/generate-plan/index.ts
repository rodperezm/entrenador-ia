// Edge Function "generate-plan": arma la rutina semanal con Claude.
//
// La app envía su perfil, la configuración de la semana, los ejercicios
// candidatos YA FILTRADOS por restricciones/equipamiento y un resumen del
// historial. Claude solo puede elegir entre esos candidatos; la respuesta se
// valida aquí (y otra vez en la app) antes de devolverla.
//
// Secretos (Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  (obligatorio)
//   CLAUDE_MODEL       (opcional; por defecto claude-opus-5-5)

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5-5';
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const KEEP_ALIVE_MS = 10_000;

// Claude puede tardar más de un minuto y Safari corta la conexión si no recibe datos.
// Se envían saltos de línea mientras trabaja y al final el resultado en JSON, que los ignora.
function keepAliveResponse(work: Promise<unknown>) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      send('\n');
      timer = setInterval(() => send('\n'), KEEP_ALIVE_MS);
      work
        .then((result) => {
          clearInterval(timer);
          send(JSON.stringify(result));
          controller.close();
        })
        .catch(() => {}); // la app ya se desconectó
    },
    cancel() {
      clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' },
  });
}

type Block = 'warmup' | 'prehab' | 'main_strength' | 'cooldown';
type Candidate = { id: string; blocks: Block[]; kettlebell: boolean; [k: string]: unknown };
type RequestBody = {
  profile: { kettlebellWeightsKg: number[]; [k: string]: unknown };
  week: { day: string; [k: string]: unknown }[];
  candidates: Candidate[];
  history: unknown[];
  body?: unknown;
};

const SYSTEM = `Eres un entrenador personal experto en kettlebell, fuerza y prevención de lesiones. Armas la rutina semanal de un usuario de una app de entrenamiento en casa y parque.

Reglas obligatorias:
- Usa SOLO ejercicios de la lista "candidates", y cada uno solo en un bloque que aparezca en su campo "blocks". Ya están filtrados por las restricciones médicas y el equipamiento del usuario: no inventes otros.
- Genera exactamente los días de "week" (los activos) y, en cada día, todos los bloques habilitados y solo esos, en este orden: warmup, prehab, main_strength, cooldown. Con main_strength siempre van warmup y cooldown; con prehab siempre va warmup.
- Cantidad de ejercicios: cada bloque trae "exerciseCount"; es una base que se ajusta a los minutos, salvo que traiga "fixedCount": true, y entonces esa cantidad se respeta y solo cambian series y duración. warmup: la cantidad pedida, activando los grupos del día. prehab: la cantidad pedida, priorizando los marcados "forConditions". main_strength: la cantidad pedida, repartida por patrones en una sesión de cuerpo completo; los grupos musculares del día solo dan preferencia. cooldown: la cantidad pedida de estiramientos de los músculos trabajados ese día (usa "cooldownStretchIds" de los ejercicios de fuerza y de prehab cuando estén disponibles). Los días sin fuerza son de recuperación de la lesión: warmup breve y suave que no cargue la zona lesionada, prehab como parte principal y, si cooldown está habilitado, estiramientos suaves que lo complementen. Un día solo con cooldown son estiramientos lentos y sin forzar.
- Tiempo: cada día trae "availableMinutes" (el tiempo total), "leadPart" (la parte protagonista) y "minutesByPart" (los minutos máximos de cada parte: warmup, prehab, main = main_strength, cooldown). Calcula la duración con series, repeticiones a ~4 s cada una, descansos y unos 30 s para cambiar de ejercicio. Cada parte debe caber en sus minutos y aprovecharlos: si falta tiempo, sube series, luego duración y al final agrega ejercicios; si sobra, usa menos ejercicios, nunca menos de 1 por bloque. Con "fixedCount": true ajusta solo series y duración. Apunta a usar entre 80% y 100% de "availableMinutes" si hay fuerza. Sin fuerza es una referencia: no rellenes por rellenar, y en prehab manda la calidad.
- Lugar y equipamiento: cada día trae "location" (home = casa, park = parque) y "availableEquipment". Ese día usa SOLO candidatos cuyo "equipment" esté completo en "availableEquipment" (por ejemplo, sin barra de dominadas en el parque si no aparece "pullup_bar"). En el parque, si cabe, prefiere acarreos y caminatas con kettlebell; en casa evita saltos si hay otras opciones.
- Fuerza suave: si un día trae "gentleStrength": true es un día de lesión. En main_strength usa como máximo 2 ejercicios sencillos (complejidad ≤ 2), sin balísticos ni saltos, que no carguen la zona lesionada; la prioridad del día es el prehab.
- Fuerza: cada sesión es de cuerpo completo y mandan los patrones ("pattern"), no los músculos. Ordena A, B y C según "strengthRole". A: bisagra de la etapa disponible, pocas repeticiones de calidad y 2-3 min de descanso, con 3 a 5 series. B: solo empuje, tirón, sentadilla o zancada, y bisagra; indica "baja en 3 s, sube rápido". C: acarreo, core o remate opcional. Reparto: 3 ejercicios A + empuje + tirón; 4 agrega sentadilla; 5 agrega C; 6 agrega un segundo A si hay opción. Sin A disponible, usa bisagra en B. Si falta tiempo, quita C primero. Cada día trae "intensity": intense, moderate (una serie menos y balístico corto) o light (técnica, sin balísticos, máximo 2 series).
- Ciclo: "cycle" indica bloque, semana y foco; sigue "cycle.guide". Dentro de un bloque usa exactamente "cycle.fixedByDay" en main_strength cuando exista, salvo dolor o equipamiento. Al empezar un bloque nuevo mantén cada patrón y sube un peldaño respecto de "cycle.previousBlockExercises": más peso si existe otra kettlebell, variante más difícil del mismo patrón, más tempo o tensión, y al final más densidad o menos descanso. Lesiones, dolor, esfuerzo excesivo y equipamiento mandan sobre el ciclo.
- Varía los ejercicios entre días de la semana; no repitas en un mismo día dos variantes de la misma cadena de progresión ("chain").
- Ajusta la complejidad al nivel del usuario.
- Series, repeticiones y descansos: parte de "defaults" de cada ejercicio. Si es por tiempo, usa durationSec y deja reps en null; si es por repeticiones, al revés.
- HIIT y AMRAP: una serie del historial con "format" se hizo en circuito con menos peso. No la uses para subir carga, pero respeta su dolor.
- Cierre de la sesión: cada día lleva "finisher" con "format" normal, hiit o amrap. La persona decide; tú solo sugieres para desafiar y romper la monotonía. Usa hiit o amrap solo en días con ejercicio C, "intensity" moderate o intense, sin dolor reciente, sin semana de descarga y nunca para principiantes. En semana de máxima intensidad usa normal. Sugiere hiit uno o dos días por semana y amrap máximo un día; revisa "recentFinishers" para variar. Los demás días usa normal. En "reason" escribe una frase corta en español de Chile, tuteando, que diga por qué ese cierre conviene ese día; con normal usa null.
- Lados: con "laterality": "unilateral", reps o durationSec son por lado y cada serie incluye ambos, así que tarda el doble. Con "alternating", el número es el total de la serie.
- weightKg: solo en ejercicios con kettlebell, y SOLO con pesos de "profile.kettlebellWeightsKg". En los demás, null. Si un candidato trae "kettlebells": 2, weightKg es el peso de cada una y debe estar en "profile.kettlebellPairsKg".
- Progresión con "history" (última vez que hizo cada ejercicio):
  * Calentamiento, movilidad, equilibrio y elongación no progresan en carga: mantén series, reps o tiempo.
  * Ejercicios por tiempo (planchas, acarreos, isometrías): con RPE ≤ 8 sube 5 s; con RPE ≥ 9 mantén.
  * Completó todas las series con las reps objetivo y esfuerzo (RPE) ≤ 8 → sube 1-2 reps; si ya estaba en el máximo del rango, sube a la siguiente kettlebell que tenga y vuelve al mínimo del rango.
  * RPE ≥ 9.5 o no completó → mantén la carga.
  * "tooHard": true → quedó muy pesado (sin reserva, no completó o bajó el peso): repite la última carga y no la subas, ni siquiera en semana de máxima intensidad.
  * "pain" leve → mantén la misma carga, no subas.
  * "pain" moderado → baja la exigencia (menos reps o kettlebell más liviana).
  * "pain" fuerte → NO uses ese ejercicio esta semana: cámbialo por un candidato más suave del mismo patrón y explícalo en "rationale".
- "rationale": una frase corta en español de Chile, tuteando (tú, no vos), explicando la elección o el cambio de carga (ej: "Subimos a 16 kg: completaste 20 reps con esfuerzo 7."). Habla simple: nunca digas que un ejercicio "no está disponible". Puede ser null en calentamiento y elongación.
- "summary": 1 o 2 frases en español resumiendo el enfoque de la semana.
- En "rationale" y "summary", llama "ciclo" a las 4 semanas; nunca digas "bloque".`;

const nullableInt = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
const SCHEMA = {
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

type Slot = {
  exerciseId: string;
  sets: number;
  reps: number | null;
  durationSec: number | null;
  weightKg: number | null;
  restSec: number;
  rationale: string | null;
};
type Plan = {
  summary: string;
  days: {
    day: string;
    finisher: { format: 'normal' | 'hiit' | 'amrap'; reason: string | null };
    blocks: { type: Block; slots: Slot[] }[];
  }[];
};

// Descarta lo que no cumpla las reglas duras en vez de confiar en el modelo.
function sanitize(plan: Plan, body: RequestBody): Plan {
  const byId = new Map(body.candidates.map((c) => [c.id, c]));
  const owned = body.profile.kettlebellWeightsKg;
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
                  byId.get(s.exerciseId)!.kettlebell && s.weightKg != null && owned.includes(s.weightKg)
                    ? s.weightKg
                    : null,
              })),
          }))
          .filter((b) => b.slots.length > 0),
      })),
  };
}

// Claves nuevas (JSON con varias claves por nombre) o, si no, la anon heredada.
function publishableKey(): string {
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0];
  }
  return Deno.env.get('SUPABASE_ANON_KEY')!;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Solo usuarios con sesión (anónima o con correo) pueden gastar créditos.
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey());
  const { data: auth } = await supabase.auth.getUser(token);
  if (!auth?.user) return json({ error: 'unauthorized' }, 401);

  let body: RequestBody;
  try {
    body = await req.json();
    if (!Array.isArray(body.candidates) || !Array.isArray(body.week) || body.week.length === 0) throw new Error();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  return keepAliveResponse(generatePlan(body));
});

// La respuesta ya empezó, así que los errores van dentro del JSON y no como estado HTTP.
async function generatePlan(body: RequestBody) {
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: JSON.stringify(body) }],
    });

    if (response.stop_reason === 'refusal') return { error: 'refusal' };
    if (response.stop_reason === 'max_tokens') return { error: 'truncated' };

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return { error: 'empty_response' };
    const plan = sanitize(JSON.parse(text.text) as Plan, body);

    return { plan, model: response.model, usage: response.usage };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { error: 'anthropic_key_invalid' };
    if (err instanceof Anthropic.RateLimitError) return { error: 'rate_limited' };
    if (err instanceof Anthropic.APIError) {
      console.error('Error de Claude', err.status, err.message);
      return { error: 'anthropic_error', status: err.status };
    }
    console.error('Error interno', err);
    return { error: 'internal_error' };
  }
}
