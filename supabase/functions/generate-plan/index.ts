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
- Cantidad de ejercicios: cada bloque trae "exerciseCount"; úsala como máximo. warmup: la cantidad pedida, activando los grupos del día. prehab: la cantidad pedida, priorizando los marcados "forConditions". main_strength: la cantidad pedida, repartida entre los grupos musculares del día. cooldown: la cantidad pedida de estiramientos de los músculos trabajados ese día (usa "cooldownStretchIds" de los ejercicios de fuerza y de prehab cuando estén disponibles). Los días sin fuerza (solo prehab) son de recuperación de la lesión: elige prehab y estiramientos suaves que la complementen.
- Tiempo: cada día trae "availableMinutes", el tiempo que el usuario tiene ese día. La sesión completa (series, repeticiones a ~4 s cada una, descansos y unos 30 s para cambiar de ejercicio) debe caber en ese tiempo. Si no cabe, usa menos ejercicios (empezando por el bloque más largo, nunca menos de 1 por bloque), menos series o descansos más cortos; menciona el ajuste en "summary".
- Lugar y equipamiento: cada día trae "location" (home = casa, park = parque) y "availableEquipment". Ese día usa SOLO candidatos cuyo "equipment" esté completo en "availableEquipment" (por ejemplo, sin barra de dominadas en el parque si no aparece "pullup_bar"). En el parque, si cabe, prefiere acarreos y caminatas con kettlebell; en casa evita saltos si hay otras opciones.
- Varía los ejercicios entre días de la semana; no repitas en un mismo día dos variantes de la misma cadena de progresión ("chain").
- Ajusta la complejidad al nivel del usuario.
- Series, repeticiones y descansos: parte de "defaults" de cada ejercicio. Si es por tiempo, usa durationSec y deja reps en null; si es por repeticiones, al revés.
- weightKg: solo en ejercicios con kettlebell, y SOLO con pesos de "profile.kettlebellWeightsKg". En los demás, null.
- Progresión con "history" (última vez que hizo cada ejercicio):
  * Completó todas las series con las reps objetivo y esfuerzo (RPE) ≤ 8 → sube 1-2 reps; si ya estaba en el máximo del rango, sube a la siguiente kettlebell que tenga y vuelve al mínimo del rango.
  * RPE ≥ 9.5 o no completó → mantén la carga.
  * Marcó dolor → baja la exigencia (menos reps o kettlebell más liviana) o cambia por un candidato más suave del mismo grupo.
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

    if (response.stop_reason === 'refusal') return json({ error: 'refusal' }, 422);
    if (response.stop_reason === 'max_tokens') return json({ error: 'truncated' }, 502);

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return json({ error: 'empty_response' }, 502);
    const plan = sanitize(JSON.parse(text.text) as Plan, body);

    return json({ plan, model: response.model, usage: response.usage });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json({ error: 'anthropic_key_invalid' }, 500);
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'rate_limited' }, 429);
    if (err instanceof Anthropic.APIError) return json({ error: 'anthropic_error', status: err.status }, 502);
    return json({ error: 'internal_error' }, 500);
  }
});
