// Banco de pruebas de la IA de KettAI: personas simuladas entrenando varias semanas.
//
// Cada semana, para cada persona: la app arma el pedido (igual que en el teléfono), Claude responde
// (por lotes, a mitad de precio, a través de la función bench-claude del proyecto de pruebas), la app
// lo valida y corrige como siempre, el revisor de reglas le pone nota y la persona simulada "entrena"
// esa semana, lo que alimenta el historial de la siguiente. Al final, un Claude juez evalúa cada semana.
//
// Uso (desde la raíz del repo):
//   npx tsx tools/banco/run.ts --run piloto --personas p01-rodrigo,c02-dolor-fuerte-semana3 --weeks 3
//   npx tsx tools/banco/run.ts --run principal --all --weeks 8
//   npx tsx tools/banco/run.ts --run seco --all --weeks 2 --dry     (sin IA: usa las reglas, gratis)
// Opciones: --model claude-sonnet-5-5 (el de producción), --no-judge, --judge-only.
// La corrida se guarda en tools/banco/corridas/<run>/ y se puede retomar: lo hecho no se repite.

// El reloj simulado va primero: reemplaza Date antes de que cargue el código de la app.
import { setNow } from './clock';
import { EXERCISES } from '@/data/exercises.seed';
import { guardAiPlan } from '@/domain/aiGuard';
import { cycleInfo } from '@/domain/cycle';
import { generateWeekByRules, weekLocks } from '@/domain/generator';
import type { GeneratedWeekPlan, StoredWeekPlan, WorkoutSession } from '@/domain/schema';
import { buildAiRequest } from '@/features/planner/aiRequest';
import { checkAiPlan } from '@/features/planner/aiCheck';
import { type AiRequest, type RawPlan, reviewAiPlan } from '@/aiCases/review';
import type { AiCase } from '@/aiCases/cases';
import { EFFORT, MAX_TOKENS, type RequestBody, sanitize, SCHEMA, SYSTEM } from '../../supabase/functions/generate-plan/prompt';
import { benchCheck, strongPainLastWeek } from './checks';
import { type Judgment, judgeParams, judgePrompt } from './judge';
import { PERSONAS, type Persona } from './personas';
import { simulateWeek, type SimState } from './simulate';
import { type BatchResult, readJson, runBatch, runDir, spend, writeJson } from './util';
import { writeReport } from './report';

// ---------- argumentos ----------
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const RUN = opt('run', 'prueba')!;
const WEEKS = Number(opt('weeks', '8'));
const MODEL = opt('model', 'claude-sonnet-5-5')!;
const DRY = flag('dry');
const chosen = flag('all') ? PERSONAS : PERSONAS.filter((p) => (opt('personas') ?? '').split(',').includes(p.id));
if (!chosen.length) throw new Error('Elige personas con --personas a,b,c o --all');

const DAY = 864e5;
const START = Date.parse('2026-09-07T08:00:00.000Z'); // un lunes; el reloj es simulado

// ---------- estado de la corrida ----------
export type WeekRecord = {
  week: number;
  generator: 'llm' | 'rules-fallback' | 'dry';
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
  raw: RawPlan | null;
  attackText: string | null;
  review: { score: number; usable: boolean; fixedByApp: number; graves: string[]; avisos: string[]; finalGraves: string[] };
  judgePrompt?: string;
  judgment?: Judgment | null;
  judgeCostUsd?: number;
};
type PersonaState = {
  id: string;
  monday: number; // lunes de la próxima semana a armar
  history: WorkoutSession[];
  stored: StoredWeekPlan | null;
  sim: SimState;
  prepWeeks: number;
  records: WeekRecord[];
};
type RunState = { run: string; model: string; createdAt: string; personas: Record<string, PersonaState> };

const statePath = `${runDir(RUN)}/state.json`;
const state = readJson<RunState>(statePath, { run: RUN, model: MODEL, createdAt: new Date().toISOString(), personas: {} });
const save = () => writeJson(statePath, state);

const meta = (p: Persona, st: PersonaState, generator: 'rules' | 'llm') => ({
  generatedAt: new Date().toISOString(),
  generator,
  configHash: 'banco',
  cycleBlock: cycleInfo(st.history, p.profile, p.week.days).blockStart,
});

// Semanas de preparación (las arma siempre la app con reglas, sin IA) hasta que empieza el ciclo.
function prepare(p: Persona): PersonaState {
  const st: PersonaState = { id: p.id, monday: START, history: [], stored: null, sim: { trainedWeeks: 0 }, prepWeeks: 0, records: [] };
  for (let i = 0; i < 3; i++) {
    setNow(st.monday);
    if (!cycleInfo(st.history, p.profile, p.week.days).preparation) break;
    const plan = generateWeekByRules(p.week, p.profile, EXERCISES, st.history, st.monday);
    st.stored = { ...plan, ...meta(p, st, 'rules') };
    st.history = [...simulateWeek(p, plan, 0, st.monday, st.sim, `prep${i}`), ...st.history];
    st.monday += 7 * DAY;
    st.prepWeeks++;
  }
  return st;
}

// Lo que se le manda a Claude: exactamente lo de la función generate-plan.
const planParams = (body: unknown) => ({
  model: MODEL,
  max_tokens: MAX_TOKENS,
  system: SYSTEM,
  output_config: { effort: EFFORT, format: { type: 'json_schema', schema: SCHEMA } },
  messages: [{ role: 'user', content: JSON.stringify(body) }],
});

// ¿Qué texto adulteró el ataque? (para mostrárselo al juez)
function attackDiff(original: unknown, attacked: unknown): string | null {
  const a = JSON.stringify(original);
  const found: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string' && v.length > 30 && !a.includes(JSON.stringify(v).slice(1, -1))) found.push(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(attacked);
  return found.join(' | ') || null;
}

type Prepared = { p: Persona; st: PersonaState; week: number; request: AiRequest; body: unknown; attackText: string | null };

function prepareWeek(p: Persona, st: PersonaState): Prepared {
  setNow(st.monday);
  const week = st.records.length + 1;
  const request = buildAiRequest(p.week, p.profile, EXERCISES, st.history, null, st.stored, st.monday);
  const body = p.attack ? p.attack(request as unknown as Record<string, unknown>) : request;
  return { p, st, week, request, body, attackText: p.attack ? attackDiff(request, body) : null };
}

// La app recibe la respuesta: la función la limpia, la app la valida y la guardia la corrige.
function processWeek(x: Prepared, res: BatchResult | null) {
  const { p, st, week, request } = x;
  setNow(st.monday);
  let raw: RawPlan | null = null;
  let generator: WeekRecord['generator'] = DRY ? 'dry' : 'llm';
  if (DRY) {
    const rules = generateWeekByRules(p.week, p.profile, EXERCISES, st.history, st.monday);
    raw = { summary: rules.summary, days: rules.days.map((d) => ({ ...d, finisher: { format: 'normal', reason: null } })) } as RawPlan;
  } else if (res?.type === 'succeeded' && res.text && res.stop_reason !== 'refusal') {
    try {
      raw = JSON.parse(res.text) as RawPlan;
    } catch {
      raw = null;
    }
  }
  const cycle = cycleInfo(st.history, p.profile, p.week.days);
  const { lockedByDay, rotate } = weekLocks(st.stored, cycle.blockStart, EXERCISES, p.week.days);
  let final: GeneratedWeekPlan;
  try {
    if (!raw) throw new Error('sin respuesta');
    const cleaned = sanitize(structuredClone(raw) as never, x.body as RequestBody);
    const checked = checkAiPlan({ plan: cleaned as never }, request, p.week);
    final = guardAiPlan(checked, {
      days: p.week.days,
      profile: p.profile,
      exercises: EXERCISES,
      history: st.history,
      lockedByDay,
      rotate,
      mainCandidates: request.candidates.filter((c) => c.blocks.includes('main_strength')).map((c) => c.id),
    });
  } catch {
    if (!DRY) generator = 'rules-fallback';
    final = generateWeekByRules(p.week, p.profile, EXERCISES, st.history, st.monday, lockedByDay, rotate);
  }

  // Nota del revisor de reglas de la app + revisiones propias del banco.
  const texts = raw ? [raw.summary ?? '', ...(raw.days ?? []).flatMap((d) => [d.finisher?.reason ?? '', ...d.blocks.flatMap((b) => b.slots.map((s) => s.rationale ?? ''))])] : [];
  const kase: AiCase = {
    id: p.id,
    name: p.name,
    why: p.why,
    profile: p.profile,
    week: p.week,
    history: () => st.history,
    forbidden: strongPainLastWeek(st.history, st.monday),
    check: benchCheck(p, st.history, st.monday, texts),
  };
  const review = reviewAiPlan(kase, request, raw ?? { days: [] }, st.history);
  const fmt = (f: { day: string | null; text: string }) => `${f.day ?? 'semana'}: ${f.text}`;
  const graves = review.findings.filter((f) => f.level === 'grave').map(fmt);
  const record: WeekRecord = {
    week,
    generator,
    costUsd: res?.costUsd ?? 0,
    inputTokens: res?.usage?.input_tokens ?? 0,
    outputTokens: res?.usage?.output_tokens ?? 0,
    stopReason: res?.stop_reason ?? (res ? res.type : null),
    raw,
    attackText: x.attackText,
    review: {
      score: review.score,
      usable: review.usable,
      fixedByApp: review.fixedByApp,
      graves,
      avisos: review.findings.filter((f) => f.level === 'aviso').map(fmt),
      finalGraves: review.finalFindings.map(fmt),
    },
  };
  if (raw) record.judgePrompt = judgePrompt(p, week, st.history, raw, graves, x.attackText);

  // La persona entrena la semana que recibió.
  st.stored = { ...final, ...meta(p, st, 'llm') };
  st.history = [...simulateWeek(p, final, week, st.monday, st.sim), ...st.history];
  st.monday += 7 * DAY;
  st.records.push(record);
}

async function main() {
  console.log(`Corrida «${RUN}»: ${chosen.length} personas, hasta ${WEEKS} semanas, modelo ${MODEL}${DRY ? ' (en seco, sin IA)' : ''}`);
  if (!DRY) console.log(`Gasto acumulado del banco antes de empezar: USD ${(await spend()).spentUsd.toFixed(2)}`);
  for (const p of chosen) state.personas[p.id] ??= prepare(p);
  save();

  if (!flag('judge-only')) {
    for (let w = 1; w <= WEEKS; w++) {
      const todo = chosen
        .filter((p) => w <= Math.min(WEEKS, p.weeks ?? WEEKS) && state.personas[p.id].records.length === w - 1)
        .map((p) => prepareWeek(p, state.personas[p.id]));
      if (!todo.length) continue;
      console.log(`Semana ${w}: ${todo.length} personas`);
      let results = new Map<string, BatchResult>();
      if (!DRY) {
        const { results: rs } = await runBatch(
          `${RUN}-s${w}`,
          todo.map((x) => ({ custom_id: `${x.p.id}__s${w}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64), params: planParams(x.body) })),
        );
        results = new Map(rs.map((r) => [r.custom_id, r]));
      }
      for (const x of todo) processWeek(x, results.get(`${x.p.id}__s${w}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)) ?? null);
      save();
    }
  }

  if (!DRY && !flag('no-judge')) {
    const pending = chosen.flatMap((p) =>
      state.personas[p.id].records.filter((r) => r.judgePrompt && r.judgment === undefined).map((r) => ({ p, r })),
    );
    if (pending.length) {
      console.log(`Juez: ${pending.length} semanas`);
      const cid = (p: Persona, w: number) => `juez_${p.id}_s${w}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
      const { results } = await runBatch(`${RUN}-juez`, pending.map(({ p, r }) => ({ custom_id: cid(p, r.week), params: judgeParams(r.judgePrompt!) })));
      const byId = new Map(results.map((r) => [r.custom_id, r]));
      for (const { p, r } of pending) {
        const res = byId.get(cid(p, r.week));
        r.judgeCostUsd = res?.costUsd ?? 0;
        try {
          r.judgment = res?.text ? (JSON.parse(res.text) as Judgment) : null;
        } catch {
          r.judgment = null;
        }
      }
      save();
    }
  }

  writeReport(state);
  if (!DRY) console.log(`Gasto acumulado del banco: USD ${(await spend()).spentUsd.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
