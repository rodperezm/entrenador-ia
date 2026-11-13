import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCalendar } from '@/domain/calendar';
import { applyDayChoice, defaultWeekConfig, strengthDaysFrom, weekWithStrength } from '@/domain/week';

const week = (days: number) => {
  const w = defaultWeekConfig();
  const choices = weekWithStrength(strengthDaysFrom(days, 'mon'));
  return { days: w.days.map((d) => ({ ...applyDayChoice(d, choices[d.day]), availableMinutes: 45 })) };
};
// Jueves 12 de noviembre de 2026, 15:00 en el reloj del teléfono.
const NOW = new Date(2026, 10, 12, 15, 0, 0);
const options = { hour: 19, minute: 30, remindBeforeMin: 15, hasConditions: false, now: NOW };
const eventsOf = (ics: string) => ics.split('BEGIN:VEVENT').slice(1);
const field = (event: string, name: string) => event.match(new RegExp(`^${name}[:;](.*)$`, 'm'))?.[1].trim();

test('un evento semanal por cada día de entrenamiento, a la hora elegida', () => {
  const w = week(3);
  const ics = buildCalendar(w, options)!;
  const active = w.days.filter((d) => d.active);
  const events = eventsOf(ics);
  assert.equal(events.length, active.length);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  for (const e of events) {
    assert.match(field(e, 'DTSTART')!, /^\d{8}T193000$/);
    assert.match(field(e, 'DTEND')!, /^\d{8}T201500$/); // 45 minutos después
    assert.match(field(e, 'RRULE')!, /^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$/);
    assert.equal(field(e, 'TRIGGER'), '-PT15M');
  }
});

test('cada evento parte en su propio día de la semana, de hoy en adelante', () => {
  const ics = buildCalendar(week(3), options)!;
  const code = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  for (const e of eventsOf(ics)) {
    const s = field(e, 'DTSTART')!;
    const date = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
    assert.equal(code[date.getDay()], field(e, 'RRULE')!.split('BYDAY=')[1]);
    const daysAhead = Math.round((date.getTime() - new Date(2026, 10, 12).getTime()) / 864e5);
    assert.ok(daysAhead >= 0 && daysAhead <= 6, `${s} debería caer dentro de los próximos 7 días`);
  }
});

test('el identificador de cada día es fijo: volver a agregarlo actualiza, no duplica', () => {
  const uids = (ics: string) => eventsOf(ics).map((e) => field(e, 'UID'));
  const first = uids(buildCalendar(week(3), options)!);
  const later = uids(buildCalendar(week(3), { ...options, hour: 7, now: new Date(2026, 11, 1, 9, 0, 0) })!);
  assert.deepEqual(first, later);
  assert.equal(new Set(first).size, first.length);
});

test('sin días de entrenamiento no hay archivo', () => {
  const w = defaultWeekConfig();
  assert.equal(buildCalendar({ days: w.days.map((d) => ({ ...d, active: false })) }, options), null);
});

test('ninguna línea pasa de 75 bytes y los textos van escapados', () => {
  const ics = buildCalendar(week(6), { ...options, hasConditions: true, appUrl: 'https://rodperezm.github.io/entrenador-ia/' })!;
  for (const line of ics.split('\r\n')) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `línea larga: ${line}`);
  }
  // Las partes se unen con « + » y la descripción trae saltos de línea: deben ir escapados.
  assert.ok(ics.includes('\\n'));
  assert.ok(!/SUMMARY:.*[^\\],/.test(ics.replace(/\r\n /g, '')));
});
