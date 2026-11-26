// Edge Function "generate-plan": arma la rutina semanal con Claude.
//
// La app envía su perfil, la configuración de la semana, los ejercicios
// candidatos YA FILTRADOS por restricciones/equipamiento y un resumen del
// historial. Claude solo puede elegir entre esos candidatos; la respuesta se
// valida aquí (y otra vez en la app) antes de devolverla.
//
// Cada cuenta tiene un límite de semanas con IA (migraciones 0003 y 0005). El cupo se reserva
// antes de llamar a Claude, para que varias consultas simultáneas no pasen con un solo cupo, y
// solo las consultas exitosas se cuentan (migración 0012):
//   - con plan: la fila queda con el modelo y los tokens gastados;
//   - Claude respondió pero no sirvió: la fila queda marcada como fallida, con su gasto, y no
//     cuenta para el cupo de la persona;
//   - Claude no alcanzó a responder: no hubo gasto y la fila se borra.
//
// Secretos (Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  (obligatorio)
//   CLAUDE_MODEL       (opcional; por defecto claude-opus-5-5)

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { type ClaudeReply, settle, usageRecord } from './usage.ts';
import { cleanRequest, EFFORT, MAX_TOKENS, type Plan, type RequestBody, sanitize, SCHEMA, SYSTEM } from './prompt.ts';

const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5-5';
// Modelos más económicos que un pedido puede elegir para compararlos; nunca uno más caro.
const TEST_MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5'];
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

type Reservation = {
  status: 'ok' | 'weekly_limit' | 'daily_cap' | 'needs_account';
  generation_id: number | null;
  weekly_limit: number | null;
  resets_at: string;
};
// El pedido más grande medido (todo el equipamiento, 6 días, sin historial) pesa unos 90 KB.
const MAX_BODY_BYTES = 400_000;
const MAX_CANDIDATES = 400;
const MAX_DAYS = 7;
// Claves nuevas (JSON con varias claves por nombre) o, si no, la anon heredada.
function publishableKey(): string {
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0];
  }
  return Deno.env.get('SUPABASE_ANON_KEY')!;
}

// Clave del servidor, solo para anotar el gasto o devolver un cupo reservado.
function secretKey(): string | null {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? null;
}

function serverClient() {
  const key = secretKey();
  return key ? createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } }) : null;
}

// Si no se puede devolver, la consulta fallida queda contada: se prefiere eso a regalar cupos.
async function release(generationId: number) {
  const admin = serverClient();
  if (!admin) return console.error('Sin clave del servidor: no se devolvió el cupo', generationId);
  const { error } = await admin.rpc('release_ai_generation', { generation: generationId });
  if (error) console.error('No se pudo devolver el cupo', error.message);
}

// Anota en la reserva el modelo y los tokens. Devuelve false si no pudo.
async function recordUsage(generationId: number, claude: ClaudeReply, failed: boolean) {
  const admin = serverClient();
  if (!admin) {
    console.error('Sin clave del servidor: no se anotó el gasto', generationId);
    return false;
  }
  const r = usageRecord(claude, failed);
  const { error } = await admin.rpc('record_ai_usage', {
    generation: generationId,
    used_model: r.model,
    tokens_in: r.input_tokens,
    tokens_out: r.output_tokens,
    cache_read: r.cache_read_tokens,
    cache_write: r.cache_write_tokens,
    is_failed: r.failed,
  });
  if (error) console.error('No se pudo anotar el gasto', error.message);
  return !error;
}

// Cierra la reserva según cómo terminó la consulta (ver `settle` en usage.ts).
async function closeReservation(generationId: number, outcome: Outcome) {
  const step = settle({ hasPlan: 'plan' in outcome.reply, claude: outcome.claude });
  if (step === 'release') return release(generationId);
  const recorded = await recordUsage(generationId, outcome.claude!, step === 'failed');
  // Si una fallida no quedó marcada, contaría para el cupo de la persona: mejor devolverlo.
  if (!recorded && step === 'failed') await release(generationId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Solo usuarios con sesión (anónima o con correo) pueden gastar créditos.
  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.replace('Bearer ', '');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey(), {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth } = await supabase.auth.getUser(token);
  if (!auth?.user) return json({ error: 'unauthorized' }, 401);

  // El pedido se revisa antes de reservar el cupo: uno inválido o gigante no gasta nada.
  let body: RequestBody;
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);
    body = JSON.parse(text);
    if (!body || typeof body.profile !== 'object' || body.profile === null) throw new Error();
    if (!Array.isArray(body.candidates) || body.candidates.length === 0 || body.candidates.length > MAX_CANDIDATES) {
      throw new Error();
    }
    if (!Array.isArray(body.week) || body.week.length === 0 || body.week.length > MAX_DAYS) throw new Error();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  // Solo lo que manda la app; condiciones de salud fuera del catálogo = pedido adulterado.
  const cleaned = cleanRequest(body);
  if (!cleaned) return json({ error: 'bad_request' }, 400);
  body = cleaned;

  // Reserva del cupo antes de llamar a Claude.
  const { data: reserved, error: reserveError } = await supabase.rpc('reserve_ai_generation').single<Reservation>();
  if (reserveError || !reserved) {
    console.error('No se pudo reservar el cupo', reserveError?.message);
    return json({ error: 'quota_unavailable' }, 503);
  }
  if (reserved.status !== 'ok' || reserved.generation_id == null) {
    const status = reserved.status === 'needs_account' ? 403 : 429;
    return json({ error: reserved.status, resetsAt: reserved.resets_at, limit: reserved.weekly_limit }, status);
  }
  const generationId = reserved.generation_id;

  return keepAliveResponse(
    generatePlan(body)
      .catch((): Outcome => ({ reply: { error: 'internal_error' }, claude: null }))
      .then(async (outcome) => {
        await closeReservation(generationId, outcome);
        return outcome.reply;
      }),
  );
});

// `reply` es lo que recibe la app (igual que antes); `claude`, lo que gastó la llamada si alcanzó
// a responder, aunque la respuesta no sirva.
type Outcome = { reply: Record<string, unknown>; claude: ClaudeReply | null };

// La respuesta ya empezó, así que los errores van dentro del JSON y no como estado HTTP.
async function generatePlan(body: RequestBody): Promise<Outcome> {
  let claude: ClaudeReply | null = null;
  try {
    const { model: requested, ...request } = body;
    // Con un tope de 32.000 tokens la API pide streaming (una respuesta larga no puede quedar esperando
    // sin datos); finalMessage() junta las partes y entrega lo mismo que antes.
    const response = await anthropic.beta.messages.stream({
      model: requested && TEST_MODELS.includes(requested) ? requested : MODEL,
      max_tokens: MAX_TOKENS,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: JSON.stringify(request) }],
    }).finalMessage();
    claude = { model: response.model, usage: response.usage };

    if (response.stop_reason === 'refusal') return { reply: { error: 'refusal' }, claude };
    if (response.stop_reason === 'max_tokens') return { reply: { error: 'truncated' }, claude };

    // Si el modelo se negó a mitad de camino y respondió el de respaldo, el streaming conserva el texto
    // parcial del primero: vale el último texto.
    const text = response.content.filter((b) => b.type === 'text').at(-1);
    if (!text || text.type !== 'text') return { reply: { error: 'empty_response' }, claude };
    const plan = sanitize(JSON.parse(text.text) as Plan, body);

    return { reply: { plan, model: response.model, usage: response.usage }, claude };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { reply: { error: 'anthropic_key_invalid' }, claude };
    if (err instanceof Anthropic.RateLimitError) return { reply: { error: 'rate_limited' }, claude };
    if (err instanceof Anthropic.APIError) {
      console.error('Error de Claude', err.status, err.message);
      return { reply: { error: 'anthropic_error', status: err.status }, claude };
    }
    // Un formato roto llega aquí después de que Claude respondió: `claude` ya tiene su gasto.
    console.error('Error interno', err);
    return { reply: { error: 'internal_error' }, claude };
  }
}
