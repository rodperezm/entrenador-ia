import {
  bodyFat,
  calcIndices,
  fatCuts,
  fmtNum,
  type FoldRecord,
  type Light,
  type TapeRecord,
  weightNear,
} from './body';
import type { Sex } from './schema';

// «Tu avance» en Cuerpo: cuatro miradas al cambio de la persona, de su primer registro al último.
// Muestra lo que mejora y también lo que retrocede; las medallas solo celebran lo logrado.

type BodyProfile = { sex: Sex | null; birthDate: string | null; heightCm: number | null };

const byDate = <T extends { date: string }>(xs: T[]) => [...xs].sort((a, b) => a.date.localeCompare(b.date));
const dayNum = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
export const daysBetween = (from: string, to: string) => Math.round(dayNum(to) - dayNum(from));

// ---------- 1. Lo que la balanza no ve ----------

export type CompositionPoint = { date: string; weight: number; fat: number; lean: number };
export type Composition = {
  from: string;
  to: string;
  series: CompositionPoint[];
  weight: number; // cambio en kg entre la primera y la última medición con caliper
  fat: number;
  lean: number;
};

// Grasa y masa magra en kilos, con el peso más cercano a cada medición de pliegues.
export function compositionChange(records: TapeRecord[], folds: FoldRecord[], birth: string | null): Composition | null {
  const series: CompositionPoint[] = [];
  for (const f of byDate(folds)) {
    const pct = bodyFat(f, birth).pct;
    const weight = weightNear(records, f.date);
    if (pct == null || weight == null) continue;
    const fat = (weight * pct) / 100;
    series.push({ date: f.date, weight, fat, lean: weight - fat });
  }
  if (series.length < 2) return null;
  const a = series[0];
  const b = series[series.length - 1];
  return { from: a.date, to: b.date, series, weight: b.weight - a.weight, fat: b.fat - a.fat, lean: b.lean - a.lean };
}

// ---------- 2. La cinta se cierra ----------

export const TAPE_MEASURES = [
  ['Tórax', 'chestCm'],
  ['Abdomen', 'abdomenCm'],
  ['Cintura', 'waistCm'],
  ['Cadera', 'hipCm'],
] as const;

export type TapeRow = { label: string; from: number; to: number; fromDate: string; toDate: string };
export type TapeChange = { rows: TapeRow[]; total: number; from: string; to: string };

// Cada medida, de su primer valor al último. Solo las que tienen al menos dos registros.
export function tapeChange(records: TapeRecord[]): TapeChange | null {
  const sorted = byDate(records);
  const rows: TapeRow[] = [];
  for (const [label, key] of TAPE_MEASURES) {
    const withValue = sorted.filter((r) => r[key] != null);
    if (withValue.length < 2) continue;
    const a = withValue[0];
    const b = withValue[withValue.length - 1];
    rows.push({ label, from: a[key] as number, to: b[key] as number, fromDate: a.date, toDate: b.date });
  }
  if (!rows.length) return null;
  return {
    rows,
    total: rows.reduce((s, r) => s + (r.to - r.from), 0),
    from: rows.map((r) => r.fromDate).sort()[0],
    to: rows.map((r) => r.toDate).sort()[rows.length - 1],
  };
}

// ---------- 3. Camino al verde ----------

export type Meter = {
  key: 'ice' | 'fat' | 'imc' | 'icc';
  title: string;
  start: number | null; // null si hay un solo registro
  now: number;
  cuts: [number, number]; // verde bajo el primero, amarillo hasta el segundo, rojo desde ahí
  digits: number;
  unit: string;
  light: Light;
  trend: 'better' | 'worse' | 'same';
  next: string; // qué falta para el siguiente color, o que ya está en verde
  stage: Stage | null; // el escalón en curso; null si ya está en verde
};

// La meta va por escalones para no desanimar: en rojo, la meta es el amarillo; en amarillo, el
// verde. La barra parte donde partiste, o en el borde del color si ya subiste un escalón.
export type Stage = {
  from: number;
  goal: number;
  goalLight: 'ok' | 'warn';
  progress: number; // 0 a 1: cuánto del escalón ya recorriste
  climbed: boolean; // partiste en rojo y ya estás en amarillo
  fell: boolean; // partiste en un color mejor y retrocediste de color
};

function stageOf(start: number | null, now: number, [a, b]: [number, number]): Stage | null {
  if (now < a) return null;
  const red = now >= b;
  const goal = red ? b : a;
  const from = Math.max(now, start == null ? now : red ? start : Math.min(start, b));
  const progress = from > goal ? Math.min(1, Math.max(0, (from - now) / (from - goal))) : 0;
  const fell = start != null && (red ? start < b : start < a);
  return {
    from,
    goal,
    goalLight: red ? 'warn' : 'ok',
    progress: fell ? 0 : progress,
    climbed: start != null && start >= b && !red,
    fell,
  };
}

const lightOf = (v: number, [a, b]: [number, number]): Light => (v < a ? 'ok' : v < b ? 'warn' : 'bad');
const RANK: Record<Light, number> = { ok: 0, warn: 1, bad: 2, na: 3 };

function meter(m: Omit<Meter, 'light' | 'trend' | 'stage'> & { step: number }): Meter {
  const { step, ...rest } = m;
  const d = rest.start == null ? 0 : rest.now - rest.start;
  return {
    ...rest,
    light: lightOf(rest.now, rest.cuts),
    trend: Math.abs(d) < step ? 'same' : d < 0 ? 'better' : 'worse',
    stage: stageOf(rest.start, rest.now, rest.cuts),
  };
}

// Primer y último valor de un índice calculado registro por registro.
function firstLast(records: TapeRecord[], pick: (r: TapeRecord) => number | null) {
  const vals = byDate(records)
    .map(pick)
    .filter((v): v is number => v != null);
  if (!vals.length) return null;
  return { start: vals.length > 1 ? vals[0] : null, now: vals[vals.length - 1] };
}

export function meters(records: TapeRecord[], folds: FoldRecord[], profile: BodyProfile): Meter[] {
  const out: Meter[] = [];
  const h = profile.heightCm;
  const m2 = h ? (h / 100) ** 2 : null;

  if (h) {
    const ice = firstLast(records, (r) => calcIndices(r, h).ice);
    if (ice) {
      const cuts: [number, number] = [0.5, 0.6];
      const next =
        ice.now >= 0.6
          ? `Amarillo con cintura bajo ${fmtNum(0.6 * h)} cm`
          : ice.now >= 0.5
            ? `Verde con cintura bajo ${fmtNum(0.5 * h)} cm`
            : 'En verde';
      out.push(meter({ key: 'ice', title: 'Cintura-estatura', ...ice, cuts, digits: 3, unit: '', next, step: 0.005 }));
    }
  }

  const sex = profile.sex;
  const fats = byDate(folds)
    .map((f) => ({ f, b: bodyFat(f, profile.birthDate) }))
    .filter((x) => x.b.pct != null);
  if (fats.length) {
    const last = fats[fats.length - 1];
    const [, b, c] = fatCuts(sex ?? last.f.sex, last.b.age);
    const now = last.b.pct as number;
    const next =
      now >= c
        ? `Faltan ${fmtNum(now - c)} puntos para «promedio»`
        : now >= b
          ? `Faltan ${fmtNum(now - b)} puntos para «ideal»`
          : 'En verde';
    out.push(
      meter({
        key: 'fat',
        title: '% de grasa',
        start: fats.length > 1 ? (fats[0].b.pct as number) : null,
        now,
        cuts: [b, c],
        digits: 1,
        unit: ' %',
        next,
        step: 0.3,
      }),
    );
  }

  if (m2) {
    const imc = firstLast(records, (r) => calcIndices(r, h).imc);
    const lastWeight = byDate(records).filter((r) => r.weightKg != null).pop()?.weightKg ?? null;
    if (imc && lastWeight != null) {
      const cuts: [number, number] = [25, 30];
      const target = imc.now >= 30 ? 30 * m2 : imc.now >= 25 ? 25 * m2 : null;
      const next =
        target == null
          ? 'En verde'
          : `${imc.now >= 30 ? 'Amarillo' : 'Verde'} bajo ${fmtNum(target)} kg · faltan ${fmtNum(lastWeight - target)} kg`;
      out.push(meter({ key: 'imc', title: 'IMC', ...imc, cuts, digits: 1, unit: '', next, step: 0.1 }));
    }
  }

  const icc = firstLast(records, (r) => calcIndices(r, h).icc);
  const lastHip = byDate(records).filter((r) => r.hipCm != null).pop()?.hipCm ?? null;
  if (icc && lastHip != null) {
    const cuts: [number, number] = sex === 'female' ? [0.8, 0.85] : [0.9, 0.95];
    const target = icc.now >= cuts[1] ? cuts[1] : icc.now >= cuts[0] ? cuts[0] : null;
    const next =
      target == null
        ? 'En verde'
        : `${icc.now >= cuts[1] ? 'Amarillo' : 'Verde'} con cintura bajo ${fmtNum(target * lastHip)} cm`;
    out.push(meter({ key: 'icc', title: 'Cintura-cadera', ...icc, cuts, digits: 3, unit: '', next, step: 0.005 }));
  }
  return out;
}

// ---------- 4. Medallas ----------

export type Medal = { id: string; title: string; icon: 'zone' | 'tape' | 'fat' | 'scale' | 'calendar'; earned: boolean };

// El escalón más alto alcanzado (o el siguiente, para mostrarlo bloqueado).
const reached = (value: number, tiers: number[]) => [...tiers].reverse().find((t) => value >= t) ?? null;
const nextTier = (value: number, tiers: number[]) => tiers.find((t) => value < t) ?? null;

// Semana (lunes) de una fecha, para contar en cuántas semanas distintas hubo registro.
const weekOf = (s: string) => Math.floor((dayNum(s) + 3) / 7);

export function medals(records: TapeRecord[], folds: FoldRecord[], profile: BodyProfile): Medal[] {
  const earned: Medal[] = [];
  const locked: Medal[] = [];
  const ms = meters(records, folds, profile);

  for (const m of ms) {
    if (m.start == null) continue;
    const from = lightOf(m.start, m.cuts);
    if (RANK[m.light] >= RANK[from]) continue;
    earned.push({
      id: `zone-${m.key}`,
      title: m.light === 'ok' ? `Llegaste al verde en ${m.title.toLowerCase()}` : `Saliste del rojo en ${m.title.toLowerCase()}`,
      icon: 'zone',
      earned: true,
    });
  }

  const tape = tapeChange(records);
  if (tape && tape.total < 0) {
    const lost = -tape.total;
    const t = reached(lost, [5, 10, 20, 30, 50]);
    if (t) earned.push({ id: 'tape', title: `−${t} cm con la cinta`, icon: 'tape', earned: true });
  }

  const comp = compositionChange(records, folds, profile.birthDate);
  if (comp && comp.fat < 0) {
    const t = reached(-comp.fat, [1, 2, 3, 5, 10]);
    if (t) earned.push({ id: 'fat', title: `−${t} kg de grasa`, icon: 'fat', earned: true });
  }

  const weights = byDate(records).filter((r) => r.weightKg != null);
  if (weights.length > 1) {
    const lost = (weights[0].weightKg as number) - (weights[weights.length - 1].weightKg as number);
    const t = reached(lost, [1, 2, 5, 10, 15, 20]);
    if (t) earned.push({ id: 'scale', title: `−${t} kg en la balanza`, icon: 'scale', earned: true });
  }

  const weeks = new Set([...records, ...folds].map((r) => weekOf(r.date))).size;
  const wt = reached(weeks, [2, 4, 8, 12, 26, 52]);
  if (wt) earned.push({ id: 'weeks', title: `${wt} semanas midiendo`, icon: 'calendar', earned: true });

  // Próximas metas: los índices que aún no están en verde, y el siguiente escalón de la cinta.
  for (const m of ms) {
    if (m.light === 'ok' || locked.length >= 2) continue;
    locked.push({ id: `next-${m.key}`, title: `${m.title} · ${m.next.charAt(0).toLowerCase()}${m.next.slice(1)}`, icon: 'zone', earned: false });
  }
  if (tape && locked.length < 2) {
    const lost = Math.max(0, -tape.total);
    const t = nextTier(lost, [5, 10, 20, 30, 50]);
    if (t) locked.push({ id: 'next-tape', title: `−${t} cm con la cinta: faltan ${fmtNum(t - lost)} cm`, icon: 'tape', earned: false });
  }
  return [...earned, ...locked];
}
