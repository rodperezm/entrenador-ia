import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cycleInfo, markDeload } from '@/domain/cycle';
import { lastSessionOf } from '@/domain/progression';
import type { WorkoutSession } from '@/domain/schema';
import { applyDayChoice, defaultWeekConfig } from '@/domain/week';

// La semana de descarga (4.ª del bloque) va con menos series y sin subir carga: lo que la persona
// responde de esfuerzo no sirve para decidir la carga siguiente. Su dolor sí cuenta.

const days = defaultWeekConfig().days.map((d) => applyDayChoice(d, d.day === 'mon' ? ['main'] : []));
const session = (date: string, rpe: number, pain = 0): WorkoutSession => ({
  id: `s-${date}`,
  day: 'mon',
  location: 'home',
  startedAt: `${date}T10:00:00.000Z`,
  finishedAt: `${date}T11:00:00.000Z`,
  completed: true,
  sets: [
    {
      exerciseId: 'kb_deadlift',
      setNo: 1,
      targetReps: 10,
      repsDone: 10,
      durationSec: null,
      weightKg: 12,
      rpe,
      painFlag: pain >= 2,
      painLevel: pain,
    },
  ],
});
// Un lunes por semana desde el 5-10-2026: semanas 1, 2, 3 y 4 (descarga) del primer bloque.
const block = (deloadPain = 0) => [
  session('2026-10-26', 6, deloadPain),
  session('2026-10-19', 9),
  session('2026-10-12', 8),
  session('2026-10-05', 8),
];

test('la semana 4 en curso queda marcada como descarga', () => {
  const today = new Date('2026-10-28T12:00:00');
  assert.equal(cycleInfo(block(), 'intermediate', days, today).week, 4);
  const marked = markDeload(block(), days, today);
  assert.deepEqual(
    marked.map((s) => !!s.deload),
    [true, false, false, false],
  );
});

test('una descarga ya pasada también se marca, y la semana nueva no', () => {
  const history = [session('2026-11-02', 7), ...block()];
  const today = new Date('2026-11-04T12:00:00');
  assert.equal(cycleInfo(history, 'intermediate', days, today).week, 1);
  assert.deepEqual(
    markDeload(history, days, today).map((s) => !!s.deload),
    [false, true, false, false, false],
  );
});

test('la progresión toma la última semana normal, no la de descarga', () => {
  const marked = markDeload(block(), days, new Date('2026-11-04T12:00:00'));
  assert.equal(lastSessionOf('kb_deadlift', marked)?.session.id, 's-2026-10-19');
});

test('si en la descarga hubo dolor, ese dolor sí cuenta', () => {
  const marked = markDeload(block(2), days, new Date('2026-11-04T12:00:00'));
  assert.equal(lastSessionOf('kb_deadlift', marked)?.session.id, 's-2026-10-26');
});

// Banco de pruebas, 26-11-2026: en la descarga el curl con 8 kg quedó en esfuerzo 9,5 y la IA lo
// subió a 12 kg. Si la carga liviana ya costó demasiado, la de antes no puede subir.
test('si en la descarga le costó demasiado, ese esfuerzo sí cuenta', () => {
  const hard = [session('2026-10-26', 9.5), ...block().slice(1)];
  const marked = markDeload(hard, days, new Date('2026-11-04T12:00:00'));
  assert.equal(lastSessionOf('kb_deadlift', marked)?.session.id, 's-2026-10-26');
});
