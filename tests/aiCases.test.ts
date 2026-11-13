import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AI_CASES } from '@/aiCases/cases';
import { type AiRequest, caseRequest, type RawPlan, reviewAiPlan } from '@/aiCases/review';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { generateWeekByRules } from '@/domain/generator';
import { A_STAGES, unlockedA } from '@/domain/strength';

// Casos fijos de la IA. Aquí se prueba, sin gastar IA:
//  1. que a la IA solo se le ofrece lo que cada persona puede hacer,
//  2. que el revisor que le pone nota detecta los errores que importan,
//  3. que las respuestas reales guardadas (tests/ia-grabadas) siguen siendo utilizables por la app.
// Las llamadas reales a la IA se hacen desde la pantalla /ai-cases, en modo desarrollo.

const NOW = Date.parse('2026-11-11T12:00:00.000Z'); // miércoles
const graves = (r: { findings: { level: string; text: string; day: string | null }[] }) =>
  r.findings.filter((f) => f.level === 'grave').map((f) => `${f.day ?? 'semana'}: ${f.text}`);

// Una semana armada por las reglas de la app, en el formato en que respondería la IA. Las reglas
// agregan por su cuenta la activación de la lesión al calentamiento; eso la IA no lo puede elegir
// (lo completa la app después), así que aquí se quita.
const rulesAnswer = (c: (typeof AI_CASES)[number]): RawPlan => {
  const plan = generateWeekByRules(c.week, c.profile, EXERCISES, c.history(NOW), 7);
  const offered = new Map(caseRequest(c, NOW).request.candidates.map((x) => [x.id, x.blocks]));
  return {
    summary: plan.summary || 'Semana de prueba.',
    days: plan.days.map((d) => ({
      day: d.day,
      finisher: { format: 'normal', reason: null },
      blocks: d.blocks.map((b) => ({ ...b, slots: b.slots.filter((s) => offered.get(s.exerciseId)?.includes(b.type)) })),
    })),
  };
};

for (const c of AI_CASES) {
  test(`caso «${c.name}»: a la IA solo se le ofrece lo permitido`, () => {
    const { request } = caseRequest(c, NOW);
    const ids = new Set(request.candidates.map((x) => x.id));
    assert.ok(request.week.length > 0 && ids.size > 20, 'pedido con días y candidatos');
    // Nada con las restricciones activas de sus lesiones.
    const flags = new Set(c.profile.conditions.flatMap((x) => x.activeFlags));
    for (const id of ids) {
      const e = EXERCISES_BY_ID.get(id)!;
      assert.ok(!e.restrictionFlags.some((f) => flags.has(f)), `${id} tiene una restricción activa`);
    }
    for (const id of c.forbidden ?? []) assert.ok(!ids.has(id), `${id} no debía ofrecerse`);
    // En Fuerza, ningún balístico más allá de la etapa ganada.
    const allowed = unlockedA(request.cycle.stage);
    for (const x of request.candidates.filter((k) => k.blocks.includes('main_strength'))) {
      if (A_STAGES.slice(1).flat().includes(x.id)) assert.ok(allowed.includes(x.id), `${x.id} aún no está ganado`);
    }
  });

  test(`caso «${c.name}»: una semana correcta pasa la revisión sin faltas graves`, () => {
    const { request, history } = caseRequest(c, NOW);
    const review = reviewAiPlan(c, request, rulesAnswer(c), history);
    assert.deepEqual(graves(review), []);
    assert.equal(review.usable, true);
  });
}

test('el principiante parte en la etapa 1 y el atleta sin kettlebell también', () => {
  const stage = (id: string) => caseRequest(AI_CASES.find((c) => c.id === id)!, NOW).request.cycle.stage;
  assert.equal(stage('principiante'), 1);
  assert.equal(stage('atleta-sin-kettlebell'), 1);
});

test('el revisor detecta los errores que importan', () => {
  const c = AI_CASES.find((x) => x.id === 'principiante')!;
  const { request, history } = caseRequest(c, NOW);
  const good = rulesAnswer(c);
  const broken = (change: (p: RawPlan) => void) => {
    const p = structuredClone(good);
    change(p);
    return graves(reviewAiPlan(c, request, p, history)).join(' | ');
  };
  const firstMain = (p: RawPlan) => p.days![0].blocks.find((b) => b.type === 'main_strength')!.slots[0];

  assert.match(broken((p) => void p.days!.pop()), /falta el día completo/);
  assert.match(broken((p) => void (firstMain(p).exerciseId = 'kb_swing_2h')), /no se le ofreció|no se ha ganado/);
  assert.match(broken((p) => void (p.days![0].finisher = { format: 'hiit', reason: 'x' })), /cierre HIIT/);
  assert.match(
    broken((p) => void (p.days![0].blocks = p.days![0].blocks.filter((b) => b.type !== 'cooldown'))),
    /falta la parte «cooldown»/,
  );
  // Y baja la nota.
  const bad = structuredClone(good);
  bad.days!.pop();
  assert.ok(reviewAiPlan(c, request, bad, history).score < reviewAiPlan(c, request, good, history).score);
});

test('el día de fuerza suave y el de parque se revisan', () => {
  const gentle = AI_CASES.find((x) => x.id === 'lumbar-fuerza-suave')!;
  const g = caseRequest(gentle, NOW);
  const plan = rulesAnswer(gentle);
  const wed = plan.days!.find((d) => d.day === 'wed')!;
  const main = wed.blocks.find((b) => b.type === 'main_strength')!;
  main.slots = [...main.slots, ...main.slots, ...main.slots];
  assert.match(graves(reviewAiPlan(gentle, g.request, plan, g.history)).join(' | '), /fuerza suave con/);

  const park = AI_CASES.find((x) => x.id === 'parque-sin-barra')!;
  const p = caseRequest(park, NOW);
  const needsBar = p.request.candidates.find((x) => x.equipment.includes('pullup_bar') && x.blocks.includes('main_strength'));
  assert.ok(needsBar, 'el caso ofrece ejercicios con barra para los días en casa');
  const parkPlan = rulesAnswer(park);
  parkPlan.days!.find((d) => d.day === 'wed')!.blocks.find((b) => b.type === 'main_strength')!.slots[0].exerciseId =
    needsBar.id;
  assert.match(graves(reviewAiPlan(park, p.request, parkPlan, p.history)).join(' | '), /equipamiento que ese día no hay/);
});

// Respuestas reales de la IA, guardadas desde la pantalla /ai-cases. Vigilan dos cosas cuando cambia
// el código: que la app las siga pudiendo usar y que la nota no baje del piso acordado.
const RECORDED_DIR = join(__dirname, 'ia-grabadas');
const MIN_SCORE = 7;
type Recorded = { caseId: string; model: string | null; date: string; request: AiRequest; plan: RawPlan };
const recorded = existsSync(RECORDED_DIR) ? readdirSync(RECORDED_DIR).filter((f) => f.endsWith('.json')) : [];
for (const file of recorded) {
  const items = JSON.parse(readFileSync(join(RECORDED_DIR, file), 'utf8')) as Recorded[];
  for (const r of items) {
    test(`respuesta real guardada (${file} · ${r.caseId})`, () => {
      const c = AI_CASES.find((x) => x.id === r.caseId);
      assert.ok(c, `el caso ${r.caseId} ya no existe`);
      const review = reviewAiPlan(c, r.request, r.plan, c.history(Date.parse(r.date)));
      assert.equal(review.usable, true, 'la app ya no puede usar esta respuesta');
      assert.ok(review.score >= MIN_SCORE, `nota ${review.score}: ${graves(review).join(' | ')}`);
    });
  }
}
