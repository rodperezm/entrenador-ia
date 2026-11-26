// Utilidades del banco: días, archivos de la corrida y la conexión con la función bench-claude.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { realNow } from './clock';

export const DAYS_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const BANCO_DIR = dirname(new URL(import.meta.url).pathname);
export const runDir = (run: string) => join(BANCO_DIR, 'corridas', run);

export function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
}
export function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 1));
}

// ---------- bench-claude ----------

// Dirección de la función (proyecto de PRUEBAS) y contraseña del banco. La contraseña se lee de
// BENCH_TOKEN o del archivo tools/banco/.token (ignorado por git). Nunca va en el repositorio.
const URL_FN = process.env.BENCH_URL ?? 'https://pbmwojrlgvunndlxtcgi.supabase.co/functions/v1/bench-claude';
function token() {
  if (process.env.BENCH_TOKEN) return process.env.BENCH_TOKEN;
  const file = join(BANCO_DIR, '.token');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  throw new Error('Falta la contraseña del banco: BENCH_TOKEN o tools/banco/.token');
}

async function call<T>(body: unknown, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(URL_FN, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bench-token': token() },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as T & { error?: string };
      if (res.status === 402) throw Object.assign(new Error('TOPE DE GASTO ALCANZADO: ' + JSON.stringify(data)), { fatal: true });
      if (!res.ok) throw new Error(`bench-claude ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
      return data;
    } catch (err) {
      if ((err as { fatal?: boolean }).fatal || i >= tries) throw err;
      await sleep(5000 * i);
    }
  }
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type BatchResult = {
  custom_id: string;
  type: 'succeeded' | 'errored' | 'expired' | 'canceled';
  model?: string;
  stop_reason?: string;
  stop_details?: unknown;
  usage?: { input_tokens: number; output_tokens: number };
  costUsd?: number;
  text?: string | null;
  error?: unknown;
};
export type ClaudeParams = Record<string, unknown>;

export const spend = () => call<{ spentUsd: number; capUsd: number }>({ action: 'spend' });

// Envía las consultas en lotes de a pocas (el pedido de cada semana pesa ~150 KB) y espera las respuestas.
export async function runBatch(run: string, requests: { custom_id: string; params: ClaudeParams }[], log = console.log) {
  const CHUNK = 12;
  const ids: string[] = [];
  for (let i = 0; i < requests.length; i += CHUNK) {
    const r = await call<{ batchId: string; estimateUsd: number; spentUsd: number }>({
      action: 'submit',
      run,
      requests: requests.slice(i, i + CHUNK),
    });
    log(`  lote ${r.batchId}: ${Math.min(CHUNK, requests.length - i)} consultas (gasto acumulado con estimación: USD ${r.spentUsd.toFixed(2)})`);
    ids.push(r.batchId);
  }
  const start = realNow();
  const results: BatchResult[] = [];
  let cost = 0;
  for (const id of ids) {
    for (;;) {
      const s = await call<{ status: string; counts: Record<string, number> }>({ action: 'status', batchId: id });
      if (s.status === 'ended') break;
      await sleep(20_000);
    }
    const r = await call<{ results: BatchResult[]; costUsd: number }>({ action: 'results', batchId: id });
    results.push(...r.results);
    cost += r.costUsd;
  }
  log(`  listo en ${Math.round((realNow() - start) / 1000)} s, costo real USD ${cost.toFixed(3)}`);
  return { results, cost };
}
