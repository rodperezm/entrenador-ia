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
- Genera exactamente los días de "week" (los activos) y, en cada día, solo los bloques habilitados, en este orden: warmup, prehab, main_strength, cooldown.
- Cantidad de ejercicios: cada bloque trae "exerciseCount"; es una base que se ajusta a los minutos, salvo que traiga "fixedCount": true, y entonces esa cantidad se respeta y solo cambian series y duración. warmup: la cantidad pedida, activando los grupos del día. prehab: la cantidad pedida, priorizando los marcados "forConditions". main_strength: la cantidad pedida, repartida entre los grupos musculares del día. cooldown: la cantidad pedida de estiramientos de los músculos trabajados ese día (usa "cooldownStretchIds" de los ejercicios de fuerza y de prehab cuando estén disponibles). Los días sin fuerza (solo prehab) son de recuperación de la lesión: elige prehab y estiramientos suaves que la complementen.
- Tiempo: cada día trae "availableMinutes" (el tiempo total), "leadPart" (la parte protagonista) y "minutesByPart" (los minutos máximos de cada parte: warmup, prehab, main = main_strength, cooldown). Calcula la duración con series, repeticiones a ~4 s cada una, descansos y unos 30 s para cambiar de ejercicio. Cada parte debe caber en sus minutos y aprovecharlos: si falta tiempo, sube series, luego duración y al final agrega ejercicios; si sobra, usa menos ejercicios, nunca menos de 1 por bloque. Con "fixedCount": true ajusta solo series y duración. Apunta a usar entre 80% y 100% de "availableMinutes" si hay fuerza. Sin fuerza es una referencia: no rellenes por rellenar, y en prehab manda la calidad.
- Lugar y equipamiento: cada día trae "location" (home = casa, park = parque) y "availableEquipment". Ese día usa SOLO candidatos cuyo "equipment" esté completo en "availableEquipment" (por ejemplo, sin barra de dominadas en el parque si no aparece "pullup_bar"). En el parque, si cabe, prefiere acarreos y caminatas con kettlebell; en casa evita saltos si hay otras opciones.
- Fuerza suave: si un día trae "gentleStrength": true es un día de lesión. En main_strength usa como máximo 2 ejercicios sencillos (complejidad ≤ 2), sin balísticos ni saltos, que no carguen la zona lesionada; la prioridad del día es el prehab.
- Bloques de fuerza: cada candidato trae "strengthRole". En main_strength ordena A (potencia: balísticos, pocas repeticiones de calidad, 2-3 min de descanso), luego B (fuerza: "baja en 3 s, sube rápido") y al final C (remate opcional). Reparto: 2-3 ejercicios 1 A + B; 4 ejercicios 1 A + 3 B; 5 ejercicios 1 A + 3 B + 1 C; 6 o más 2 A + 3-4 B + 1 C. Si no hay A disponible, usa B. Si falta tiempo, quita C primero.
- Ciclo: "cycle" indica bloque, semana y foco; sigue "cycle.guide". Dentro de un bloque mantén los ejercicios de fuerza de cada día para poder medir el progreso. Al empezar un bloque nuevo cambia la mayoría respecto de "cycle.previousBlockExercises". Lesiones, dolor y equipamiento mandan sobre el ciclo.
- Varía los ejercicios entre días de la semana; no repitas en un mismo día dos variantes de la misma cadena de progresión ("chain").
- Ajusta la complejidad al nivel del usuario.
- Series, repeticiones y descansos: parte de "defaults" de cada ejercicio. Si es por tiempo, usa durationSec y deja reps en null; si es por repeticiones, al revés.
- weightKg: solo en ejercicios con kettlebell, y SOLO con pesos de "profile.kettlebellWeightsKg". En los demás, null.
- Progresión con "history" (última vez que hizo cada ejercicio):
  * Calentamiento, movilidad, equilibrio y elongación no progresan en carga: mantén series, reps o tiempo.
  * Ejercicios por tiempo (planchas, acarreos, isometrías): con RPE ≤ 8 sube 5 s; con RPE ≥ 9 mantén.
  * Completó todas las series con las reps objetivo y esfuerzo (RPE) ≤ 8 → sube 1-2 reps; si ya estaba en el máximo del rango, sube a la siguiente kettlebell que tenga y vuelve al mínimo del rango.
  * RPE ≥ 9.5 o no completó → mantén la carga.
  * "pain" leve → mantén la misma carga, no subas.
  * "pain" moderado → baja la exigencia (menos reps o kettlebell más liviana).
  * "pain" fuerte → NO uses ese ejercicio esta semana: cámbialo por un candidato más suave del mismo grupo muscular y explícalo en "rationale".
- "rationale": una frase corta en español de Chile, tuteando (tú, no vos), explicando la elección o el cambio de carga (ej: "Subimos a 16 kg: completaste 20 reps con esfuerzo 7."). Puede ser null en calentamiento y elongación.
- "summary": 1 o 2 frases en español resumiendo el enfoque de la semana.`;

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
        required: ['day', 'blocks'],
        properties: {
          day: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
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
type Plan = { summary: string; days: { day: string; blocks: { type: Block; slots: Slot[] }[] }[] };

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
    if (err instanceof Anthropic.APIError) return { error: 'anthropic_error', status: err.status };
    return { error: 'internal_error' };
  }
}
