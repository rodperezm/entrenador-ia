import type { DayOfWeek, WeekConfig } from './schema';
import { dayChoiceLabel, dayChoiceOf, DAYS } from './week';

// Recordatorios sin servidor: un archivo de calendario (.ics) con los días de entrenamiento.
// La persona lo agrega a su calendario y el teléfono se encarga de avisar.
//
// Cada día es un evento que se repite todas las semanas. Los eventos llevan un identificador
// fijo por día: si la persona vuelve a agregar el archivo después de cambiar su semana, la
// mayoría de los calendarios actualiza los eventos en vez de duplicarlos.

const BYDAY: Record<DayOfWeek, string> = { mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH', fri: 'FR', sat: 'SA', sun: 'SU' };
// getDay(): 0 = domingo.
const WEEKDAY: Record<DayOfWeek, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const pad = (n: number) => String(n).padStart(2, '0');
// Hora «flotante», sin zona: el evento es a esa hora donde esté el teléfono.
const stamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// El formato pide líneas de 75 bytes como máximo; las largas siguen en la línea de abajo con un espacio.
function fold(line: string) {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = ch.codePointAt(0)! > 0x7ff ? (ch.codePointAt(0)! > 0xffff ? 4 : 3) : ch.codePointAt(0)! > 0x7f ? 2 : 1;
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export type CalendarOptions = {
  /** Hora del entrenamiento, en el reloj de la persona. */
  hour: number;
  minute: number;
  /** Con cuántos minutos de anticipación avisa (0 = a la hora). */
  remindBeforeMin: number;
  /** Con lesiones, la parte «Movilidad» se llama «Lesión». */
  hasConditions: boolean;
  /** Dirección de la app, para abrirla desde el evento. */
  appUrl?: string;
  now?: Date;
};

/** Los días de entrenamiento de la semana, como archivo de calendario. Null si no hay ninguno. */
export function buildCalendar(week: WeekConfig, options: CalendarOptions): string | null {
  const { hour, minute, remindBeforeMin, hasConditions, appUrl, now = new Date() } = options;
  const active = week.days.filter((d) => d.active);
  if (!active.length) return null;

  const events = active.flatMap((d) => {
    // Primera vez: el próximo día de la semana que corresponda, hoy incluido.
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
    start.setDate(start.getDate() + ((WEEKDAY[d.day] - start.getDay() + 7) % 7));
    const end = new Date(start.getTime() + d.availableMinutes * 60_000);
    const parts = dayChoiceLabel(dayChoiceOf(d), hasConditions);
    const dayName = DAYS.find((x) => x.id === d.day)?.short ?? d.day;
    const description = [
      `${parts} · ${d.availableMinutes} min.`,
      'Abre KETTAI para ver tu rutina de hoy.',
      ...(appUrl ? [appUrl] : []),
    ].join('\n');
    return [
      'BEGIN:VEVENT',
      `UID:kettai-${d.day}@kettaiapp.com`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[d.day]}`,
      `SUMMARY:${escapeText(`KETTAI · ${parts}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      ...(appUrl ? [`URL:${appUrl}`] : []),
      `CATEGORIES:${escapeText(`KETTAI ${dayName}`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(`Hoy te toca: ${parts}`)}`,
      `TRIGGER:-PT${remindBeforeMin}M`,
      'END:VALARM',
      'END:VEVENT',
    ];
  });

  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//KETTAI//Recordatorios//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:KETTAI',
      ...events,
      'END:VCALENDAR',
    ]
      .map(fold)
      .join('\r\n') + '\r\n'
  );
}
