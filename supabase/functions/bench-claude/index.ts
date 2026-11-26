// Edge Function "bench-claude": puerta del banco de pruebas (tools/banco) hacia Claude.
//
// Solo existe en el proyecto de PRUEBAS (kettai-pruebas), nunca en producción. Usa el mismo secreto
// ANTHROPIC_API_KEY que generate-plan; la clave nunca sale del servidor.
//
// Envía las consultas por lotes (Message Batches API: mitad de precio, responde en minutos) y
// lleva la cuenta del gasto en la tabla bench_batches. Si el gasto acumulado más lo estimado del
// lote nuevo pasa el tope (BENCH_CAP_USD, por defecto 80), rechaza el lote: es el freno duro.
//
// Acciones (POST con JSON y cabecera x-bench-token):
//   { action: "submit", run: "<nombre>", requests: [{ custom_id, params }] }  -> { batchId, estimateUsd, spentUsd }
//   { action: "status", batchId }                                            -> estado del lote
//   { action: "results", batchId }                                           -> respuestas y costo real
//   { action: "spend" }                                                      -> gasto acumulado
//
// Para cambiar la contraseña del banco: calcula sha256 de una nueva y ponla en el secreto
// BENCH_TOKEN_SHA256 (Edge Functions → Secrets).

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const TOKEN_SHA256 =
  Deno.env.get('BENCH_TOKEN_SHA256') ?? '8d60d7cbba40da19b55c5c9ef589b7ef77090b106060084a68583b89a9a460df';
const CAP_USD = Number(Deno.env.get('BENCH_CAP_USD') ?? '80');

// Precio por millón de tokens EN LOTE (mitad del normal). Solo modelos permitidos.
const BATCH_PRICE: Record<string, { in: number; out: number }> = {
  'claude-sonnet-5-5': { in: 1, out: 5 },
  'claude-opus-5-5': { in: 2, out: 10 },
  'claude-haiku-5-5': { in: 0.05, out: 0.25 },
};
const MAX_TOKENS = 32000; // igual que generate-plan (prompt.ts)
const MAX_REQUESTS = 60;

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
// Clave del servidor: claves nuevas (JSON con varias por nombre) o la heredada.
function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0];
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}
const db = () => createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Gasto: lo real de los lotes ya cobrados y lo estimado de los que siguen en curso.
async function spent() {
  const { data, error } = await db().from('bench_batches').select('estimate_usd, actual_usd');
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.actual_usd ?? r.estimate_usd), 0);
}

type Usage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};
const costOf = (model: string, u: Usage) => {
  const p = BATCH_PRICE[model] ?? BATCH_PRICE['claude-opus-5-5'];
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
  return (input * p.in + (u.output_tokens ?? 0) * p.out) / 1e6;
};

type BenchRequest = { custom_id: string; params: Record<string, unknown> };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if ((await sha256(req.headers.get('x-bench-token') ?? '')) !== TOKEN_SHA256) return json({ error: 'unauthorized' }, 401);
  const body = await req.json().catch(() => null);
  try {
    switch (body?.action) {
      case 'spend':
        return json({ spentUsd: await spent(), capUsd: CAP_USD });

      case 'submit': {
        const requests = body.requests as BenchRequest[];
        if (!Array.isArray(requests) || !requests.length || requests.length > MAX_REQUESTS) {
          return json({ error: 'bad_requests' }, 400);
        }
        // Solo modelos con precio conocido y un tope de salida: el banco no es un Claude libre.
        let estimate = 0;
        for (const r of requests) {
          const model = String(r.params?.model);
          if (!BATCH_PRICE[model]) return json({ error: 'model_not_allowed', model }, 400);
          if (Number(r.params.max_tokens) > MAX_TOKENS) return json({ error: 'max_tokens' }, 400);
          if ('stream' in r.params || 'fallbacks' in r.params) return json({ error: 'param_not_allowed' }, 400);
          const inputTokens = JSON.stringify(r.params).length / 3; // estimación conservadora
          estimate += costOf(model, { input_tokens: inputTokens, output_tokens: Number(r.params.max_tokens) });
        }
        const already = await spent();
        if (already + estimate > CAP_USD) {
          return json({ error: 'cap_reached', spentUsd: already, estimateUsd: estimate, capUsd: CAP_USD }, 402);
        }
        const batch = await anthropic.messages.batches.create({ requests: requests as never });
        const { error } = await db()
          .from('bench_batches')
          .insert({ id: batch.id, run: String(body.run ?? ''), n: requests.length, estimate_usd: estimate });
        if (error) console.error('No se anotó el lote', error.message);
        return json({ batchId: batch.id, estimateUsd: estimate, spentUsd: already + estimate });
      }

      case 'status': {
        const b = await anthropic.messages.batches.retrieve(String(body.batchId));
        return json({ status: b.processing_status, counts: b.request_counts });
      }

      case 'results': {
        const id = String(body.batchId);
        const b = await anthropic.messages.batches.retrieve(id);
        if (b.processing_status !== 'ended') return json({ error: 'not_ended', status: b.processing_status }, 409);
        const out: unknown[] = [];
        let cost = 0;
        for await (const r of await anthropic.messages.batches.results(id)) {
          if (r.result.type === 'succeeded') {
            const m = r.result.message;
            const c = costOf(m.model, m.usage as Usage);
            cost += c;
            const text = m.content.find((x) => x.type === 'text');
            out.push({
              custom_id: r.custom_id,
              type: 'succeeded',
              model: m.model,
              stop_reason: m.stop_reason,
              stop_details: (m as { stop_details?: unknown }).stop_details ?? null,
              usage: m.usage,
              costUsd: c,
              text: text && text.type === 'text' ? text.text : null,
            });
          } else {
            out.push({ custom_id: r.custom_id, type: r.result.type, error: (r.result as { error?: unknown }).error ?? null });
          }
        }
        await db().from('bench_batches').update({ actual_usd: cost, ended_at: new Date().toISOString() }).eq('id', id);
        return json({ results: out, costUsd: cost });
      }
      default:
        return json({ error: 'bad_action' }, 400);
    }
  } catch (err) {
    console.error('bench-claude', err);
    return json({ error: 'internal', message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
