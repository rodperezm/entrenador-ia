import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FoldRecord, TapeRecord } from '@/domain/body';
import { compositionChange, medals, meters, tapeChange } from '@/domain/bodyProgress';

// Un caso real (anónimo): hombre de 49 años, 177 cm, del 31-10 al 17-11-2026.
const rec = (id: string, date: string, v: Partial<TapeRecord>): TapeRecord => ({
  id,
  date,
  weightKg: null,
  chestCm: null,
  waistCm: null,
  abdomenCm: null,
  hipCm: null,
  ...v,
});
const records = [
  rec('a', '2026-10-31', { weightKg: 102 }),
  rec('b', '2026-11-01', { weightKg: 101.3, chestCm: 114, waistCm: 107, abdomenCm: 114, hipCm: 113 }),
  rec('c', '2026-11-03', { weightKg: 100.8, chestCm: 113, waistCm: 105, abdomenCm: 113, hipCm: 112.5 }),
  rec('d', '2026-11-11', { weightKg: 100.4, chestCm: 113, waistCm: 105, abdomenCm: 113, hipCm: 110 }),
  rec('e', '2026-11-17', { weightKg: 100.6, chestCm: 112, waistCm: 104.5, abdomenCm: 111, hipCm: 110 }),
];
const fold = (id: string, date: string, pecho: number[], abdomen: number[], muslo: number[]): FoldRecord => ({
  id,
  date,
  sex: 'male',
  sites: { pecho, abdomen, muslo },
});
const folds = [
  fold('4', '2026-11-17', [34, 34, 34], [53, 53, 53], [18, 18, 18]),
  fold('1', '2026-11-01', [45, 44, 43], [55, 54, 53], [20, 19, 20]),
  fold('2', '2026-11-03', [43, 41, 44], [55, 55, 55], [25, 25, 25]),
  fold('3', '2026-11-11', [42, 42, 42], [49, 50, 51], [19, 20, 21]),
];
const profile = { sex: 'male' as const, birthDate: '1977-03-06', heightCm: 177 };
const round1 = (n: number) => Math.round(n * 10) / 10;

test('composición: la grasa baja más que la balanza', () => {
  const c = compositionChange(records, folds, profile.birthDate);
  assert.ok(c);
  assert.equal(c.from, '2026-11-01');
  assert.equal(c.to, '2026-11-17');
  assert.equal(round1(c.weight), -0.7);
  assert.equal(round1(c.fat), -3.1);
  assert.equal(round1(c.lean), 2.4);
  assert.equal(c.series.length, 4);
});

test('composición: con una sola medición de pliegues no hay cambio que mostrar', () => {
  assert.equal(compositionChange(records, folds.slice(0, 1), profile.birthDate), null);
});

test('cinta: cada medida de su primer valor al último, en el orden de la guía', () => {
  const t = tapeChange(records);
  assert.ok(t);
  assert.deepEqual(
    t.rows.map((r) => [r.label, r.from, r.to]),
    [
      ['Tórax', 114, 112],
      ['Abdomen', 114, 111],
      ['Cintura', 107, 104.5],
      ['Cadera', 113, 110],
    ],
  );
  assert.equal(t.total, -10.5);
});

test('semáforo: muestra lo que mejora y lo que retrocede', () => {
  const ms = Object.fromEntries(meters(records, folds, profile).map((m) => [m.key, m]));
  assert.equal(ms.ice.light, 'warn');
  assert.equal(ms.ice.trend, 'better');
  assert.equal(ms.ice.next, 'Verde con cintura bajo 88,5 cm');
  assert.equal(ms.fat.light, 'bad');
  assert.equal(ms.fat.next, 'Faltan 2,6 puntos para «promedio»');
  assert.equal(ms.imc.next, 'Amarillo bajo 94,0 kg · faltan 6,6 kg');
  assert.equal(ms.icc.trend, 'same'); // 0,947 → 0,950: dentro del margen
  assert.equal(ms.icc.light, 'bad');
});

test('semáforo por escalones: en rojo la meta es el amarillo; en amarillo, el verde', () => {
  const ms = Object.fromEntries(meters(records, folds, profile).map((m) => [m.key, m]));
  const pct = (p: number) => Math.round(p * 100);
  // Partió en rojo (0,605) y ya está en amarillo: el escalón nuevo parte en el borde (0,60).
  assert.deepEqual({ ...ms.ice.stage, progress: pct(ms.ice.stage!.progress) }, {
    from: 0.6,
    goal: 0.5,
    goalLight: 'ok',
    progress: 10,
    climbed: true,
    fell: false,
  });
  // Sigue en rojo: la meta es el amarillo, no el verde.
  assert.equal(ms.fat.stage?.goalLight, 'warn');
  assert.equal(pct(ms.fat.stage!.progress), 52);
  assert.equal(ms.imc.stage?.goal, 30);
  assert.equal(pct(ms.imc.stage!.progress), 17);
  // Cintura-cadera partió en amarillo (0,947) y volvió a rojo: la barra queda vacía.
  assert.equal(ms.icc.stage?.progress, 0);
  assert.equal(ms.icc.stage?.climbed, false);
  assert.equal(ms.icc.stage?.fell, true);
  assert.equal(ms.ice.stage?.fell, false);
});

test('semáforo por escalones: en verde no hay escalón', () => {
  const lean = [rec('a', '2026-11-01', { waistCm: 85 }), rec('b', '2026-11-08', { waistCm: 84 })];
  const [ice] = meters(lean, [], profile);
  assert.equal(ice.light, 'ok');
  assert.equal(ice.stage, null);
});

test('semáforo: con un solo registro no hay punto de partida', () => {
  const [ice] = meters(records.slice(1, 2), [], profile);
  assert.equal(ice.start, null);
  assert.equal(ice.trend, 'same');
});

test('medallas: lo logrado y las próximas metas', () => {
  const list = medals(records, folds, profile);
  assert.deepEqual(
    list.filter((m) => m.earned).map((m) => m.title),
    ['Saliste del rojo en cintura-estatura', '−10 cm con la cinta', '−3 kg de grasa', '−1 kg en la balanza', '4 semanas midiendo'],
  );
  assert.deepEqual(
    list.filter((m) => !m.earned).map((m) => m.title),
    ['Cintura-estatura · verde con cintura bajo 88,5 cm', '% de grasa · faltan 2,6 puntos para «promedio»'],
  );
});

test('medallas: sin avance no se inventan logros', () => {
  const up = [rec('a', '2026-11-03', { weightKg: 80, waistCm: 80 }), rec('b', '2026-11-05', { weightKg: 81, waistCm: 81 })];
  assert.deepEqual(
    medals(up, [], profile).filter((m) => m.earned),
    [],
  );
});
