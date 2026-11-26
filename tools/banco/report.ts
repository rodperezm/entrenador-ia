// Informe de una corrida del banco, en español, para leerlo sin abrir el código.
// Se escribe en tools/banco/corridas/<run>/informe.md y un resumen en datos en resumen.json.

import type { Judgment } from './judge';
import { byId } from './personas';
import { runDir, writeJson } from './util';
import { writeFileSync } from 'node:fs';

type Rec = {
  week: number;
  generator: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
  review: { score: number; usable: boolean; fixedByApp: number; graves: string[]; avisos: string[]; finalGraves: string[] };
  judgment?: Judgment | null;
  judgeCostUsd?: number;
};
type State = { run: string; model: string; personas: Record<string, { id: string; records: Rec[] }> };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '-');
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '-');
const usd = (n: number) => `USD ${n.toFixed(2)}`;
// Agrupa faltas parecidas: sin día, sin nombres de ejercicio y sin números.
const kind = (t: string) =>
  t
    .replace(/^[^:]*: /, '')
    .replace(/«[^»]*»/g, '«…»')
    .replace(/\d+(?:[.,]\d+)?/g, 'N')
    .trim();

export function summarize(state: State) {
  const rows = Object.values(state.personas).map((ps) => {
    const p = byId.get(ps.id)!;
    const r = ps.records;
    const j = r.map((x) => x.judgment).filter((x): x is Judgment => !!x);
    return {
      id: ps.id,
      name: p?.name ?? ps.id,
      group: p?.group ?? '?',
      weeks: r.length,
      fallbacks: r.filter((x) => x.generator === 'rules-fallback').length,
      rawGraveWeeks: r.filter((x) => x.generator !== 'rejected' && x.review.graves.length).length, // un pedido rechazado no llegó a la IA
      finalGraveWeeks: r.filter((x) => x.review.finalGraves.length).length,
      score: avg(r.map((x) => x.review.score)),
      seguridad: avg(j.map((x) => x.seguridad)),
      progresion: avg(j.map((x) => x.progresion)),
      ajuste: avg(j.map((x) => x.ajuste_perfil)),
      explicaciones: avg(j.map((x) => x.explicaciones)),
      cedio: j.filter((x) => x.guardia === 'cedio').length,
      rechazado: r.filter((x) => x.generator === 'rejected').length,
      resistio: j.filter((x) => x.guardia === 'resistio').length,
      judgeGraves: j.reduce((s, x) => s + x.fallas.filter((f) => f.gravedad === 'grave').length, 0),
      planCost: r.reduce((s, x) => s + x.costUsd, 0),
      judgeCost: r.reduce((s, x) => s + (x.judgeCostUsd ?? 0), 0),
      tokensIn: avg(r.filter((x) => x.inputTokens).map((x) => x.inputTokens)),
      tokensOut: avg(r.filter((x) => x.outputTokens).map((x) => x.outputTokens)),
    };
  });
  const recs = Object.values(state.personas).flatMap((ps) => ps.records.map((r) => ({ id: ps.id, r })));
  const plans = recs.filter((x) => x.r.costUsd > 0);
  const totals = {
    personas: rows.length,
    weeks: recs.length,
    planCost: rows.reduce((s, x) => s + x.planCost, 0),
    judgeCost: rows.reduce((s, x) => s + x.judgeCost, 0),
    costPerPlan: avg(plans.map((x) => x.r.costUsd)),
    costPerJudge: avg(recs.filter((x) => x.r.judgeCostUsd).map((x) => x.r.judgeCostUsd!)),
    tokensIn: avg(plans.map((x) => x.r.inputTokens)),
    tokensOut: avg(plans.map((x) => x.r.outputTokens)),
  };
  return { rows, recs, totals };
}

export function writeReport(state: State) {
  const { rows, recs, totals } = summarize(state);
  const L: string[] = [];
  L.push(`# Banco de pruebas KettAI — corrida «${state.run}»`, '');
  L.push(`Modelo que arma la semana: \`${state.model}\` (el de producción). ${totals.personas} personas simuladas, ${totals.weeks} semanas generadas.`, '');
  L.push('## Costo', '');
  L.push(`- Semanas: ${usd(totals.planCost)} (promedio ${usd(totals.costPerPlan || 0)} por semana, en lote a mitad de precio; ~${Math.round(totals.tokensIn || 0)} tokens de entrada y ~${Math.round(totals.tokensOut || 0)} de salida).`);
  L.push(`- Juez: ${usd(totals.judgeCost)} (promedio ${usd(totals.costPerJudge || 0)} por semana evaluada).`);
  L.push(`- Total: **${usd(totals.planCost + totals.judgeCost)}**.`, '');

  L.push('## Resultado por grupo', '');
  L.push('| Grupo | Semanas | Con falta grave de la IA | Falta grave que llegó a la persona | Descartadas (la app usó reglas) | Nota reglas (0-10) | Juez seguridad (1-5) | Juez progresión (1-5) | Ataques: resistió / cedió / rechazados por la función |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const g of ['perfil', 'conducta', 'gol']) {
    const rs = rows.filter((x) => x.group === g);
    if (!rs.length) continue;
    const weeks = rs.reduce((s, x) => s + x.weeks, 0);
    const recG = recs.filter((x) => rs.some((r) => r.id === x.id));
    const js = recG.map((x) => x.r.judgment).filter((x): x is Judgment => !!x);
    L.push(
      `| ${g} | ${weeks} | ${pct(rs.reduce((s, x) => s + x.rawGraveWeeks, 0), weeks)} | ${pct(rs.reduce((s, x) => s + x.finalGraveWeeks, 0), weeks)} | ${pct(rs.reduce((s, x) => s + x.fallbacks, 0), weeks)} | ${f1(avg(recG.filter((x) => x.r.generator !== 'rejected').map((x) => x.r.review.score)))} | ${f1(avg(js.map((x) => x.seguridad)))} | ${f1(avg(js.map((x) => x.progresion)))} | ${g === 'gol' ? `${js.filter((x) => x.guardia === 'resistio').length} / ${js.filter((x) => x.guardia === 'cedio').length} / ${rs.reduce((s, x) => s + x.rechazado, 0)}` : '-'} |`,
    );
  }
  L.push('');
  L.push('«Falta grave de la IA» es lo que respondió Claude antes de que la app lo corrija. «Llegó a la persona» es lo que quedó después de la limpieza de la función y la guardia de la app: eso es lo que importa para la seguridad.', '');

  L.push('## Faltas graves más repetidas (revisor de reglas)', '');
  const count = (list: string[]) => {
    const m = new Map<string, { n: number; ex: string }>();
    for (const t of list) {
      const k = kind(t);
      const v = m.get(k) ?? { n: 0, ex: t };
      v.n++;
      m.set(k, v);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  };
  const rawList = recs.filter((x) => x.r.generator !== 'rejected').flatMap((x) => x.r.review.graves.map((g) => `${g} [${x.id} s${x.r.week}]`));
  const finalList = recs.flatMap((x) => x.r.review.finalGraves.map((g) => `${g} [${x.id} s${x.r.week}]`));
  L.push('**En la respuesta de la IA:**', '');
  for (const [k, v] of count(rawList.map((t) => t.replace(/ \[[^\]]*\]$/, ''))).slice(0, 12)) {
    L.push(`- ${v.n}× ${k} — ej.: ${rawList.find((t) => kind(t.replace(/ \[[^\]]*\]$/, '')) === k)}`);
  }
  if (!rawList.length) L.push('- ninguna');
  L.push('', '**En la semana que recibe la persona:**', '');
  for (const [k, v] of count(finalList.map((t) => t.replace(/ \[[^\]]*\]$/, ''))).slice(0, 12)) {
    L.push(`- ${v.n}× ${k} — ej.: ${finalList.find((t) => kind(t.replace(/ \[[^\]]*\]$/, '')) === k)}`);
  }
  if (!finalList.length) L.push('- ninguna');

  L.push('', '## Fallas que vio el juez', '');
  const jf = recs.flatMap((x) => (x.r.judgment?.fallas ?? []).map((f) => ({ ...f, id: x.id, week: x.r.week })));
  const byType = new Map<string, typeof jf>();
  for (const f of jf) byType.set(`${f.gravedad} · ${f.tipo}`, [...(byType.get(`${f.gravedad} · ${f.tipo}`) ?? []), f]);
  const order = { grave: 0, media: 1, leve: 2 } as Record<string, number>;
  for (const [k, list] of [...byType.entries()].sort((a, b) => order[a[1][0].gravedad] - order[b[1][0].gravedad] || b[1].length - a[1].length)) {
    L.push(`- **${k}**: ${list.length} — ej.: ${list[0].detalle} [${list[0].id} s${list[0].week}]`);
  }
  if (!jf.length) L.push('- sin evaluaciones del juez');

  L.push('', '## Por persona', '');
  L.push('| Persona | Grupo | Semanas | Nota reglas | Semanas con grave (IA / final) | Juez seg. / prog. / ajuste / explic. | Graves según juez | Costo |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const x of rows) {
    L.push(
      `| ${x.name} (\`${x.id}\`) | ${x.group} | ${x.weeks} | ${f1(x.score)} | ${x.rawGraveWeeks} / ${x.finalGraveWeeks} | ${f1(x.seguridad)} / ${f1(x.progresion)} / ${f1(x.ajuste)} / ${f1(x.explicaciones)}${x.group === 'gol' ? ` (resistió ${x.resistio}, cedió ${x.cedio}, rechazados ${x.rechazado})` : ''} | ${x.judgeGraves} | ${usd(x.planCost + x.judgeCost)} |`,
    );
  }
  L.push('', '## Veredicto del juez por semana', '');
  for (const x of recs) {
    if (x.r.judgment) L.push(`- \`${x.id}\` s${x.r.week}: ${x.r.judgment.veredicto}`);
  }
  writeFileSync(`${runDir(state.run)}/informe.md`, L.join('\n') + '\n');
  writeJson(`${runDir(state.run)}/resumen.json`, { totals, rows });
}
