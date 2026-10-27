/* eslint-disable @typescript-eslint/no-redeclare -- esquema zod y su tipo comparten nombre a propósito */
import { z } from 'zod';
import type { Sex } from './schema';

// Fórmulas, umbrales y tablas portados de la bitácora MetricBody
// (github.com/rodperezm/semaforo-corporal), sin cambios en los valores.

// ---------- Registros ----------

const cm = z.number().min(30).max(250).nullable();

export const TapeRecord = z.object({
  id: z.string(),
  date: z.string(), // AAAA-MM-DD
  weightKg: z.number().min(20).max(400).nullable(),
  chestCm: cm, // tórax
  waistCm: cm, // cintura
  abdomenCm: cm, // abdomen (a la altura del ombligo)
  hipCm: cm, // cadera
});
export type TapeRecord = z.infer<typeof TapeRecord>;

// Pliegues: hasta 3 tomas por sitio, se promedian para reducir el error de pinza.
export const FoldRecord = z.object({
  id: z.string(),
  date: z.string(),
  sex: z.enum(['male', 'female']),
  sites: z.record(z.string(), z.array(z.number().min(1).max(80))),
});
export type FoldRecord = z.infer<typeof FoldRecord>;

// ---------- Semáforo ----------

export type Light = 'ok' | 'warn' | 'bad' | 'na';
export const LIGHT_LABEL: Record<Light, string> = { ok: 'Verde', warn: 'Amarillo', bad: 'Rojo', na: 'Sin datos' };

export const clsIMC = (v: number | null): Light => (v == null ? 'na' : v < 25 ? 'ok' : v <= 30 ? 'warn' : 'bad');
export function clsICC(v: number | null, sex: Sex | null): Light {
  if (v == null) return 'na';
  const [a, b] = sex === 'female' ? [0.8, 0.85] : [0.9, 0.95];
  return v < a ? 'ok' : v < b ? 'warn' : 'bad';
}
export const clsICE = (v: number | null): Light => (v == null ? 'na' : v < 0.5 ? 'ok' : v < 0.6 ? 'warn' : 'bad');
export const clsDif = (v: number | null): Light => (v == null ? 'na' : v <= 5 ? 'ok' : v <= 10 ? 'warn' : 'bad');

export const iccIdeal = (sex: Sex | null) => (sex === 'female' ? 0.8 : 0.9);

export function calcIndices(r: TapeRecord, heightCm: number | null) {
  const m = heightCm ? heightCm / 100 : null;
  return {
    imc: m && r.weightKg ? r.weightKg / (m * m) : null,
    icc: r.waistCm && r.hipCm ? r.waistCm / r.hipCm : null,
    ice: r.waistCm && heightCm ? r.waistCm / heightCm : null,
    dif: r.abdomenCm && r.waistCm ? r.abdomenCm - r.waistCm : null,
  };
}

// ---------- % de grasa ----------

export function ageAt(birth: string | null, date: string): number | null {
  if (!birth) return null;
  let a = Number(date.slice(0, 4)) - Number(birth.slice(0, 4));
  if (date.slice(5) < birth.slice(5)) a--;
  return a;
}

const AGE_LIMITS = [20, 25, 30, 35, 40, 45, 50, 55, 999];
// Límites Delgado→Ideal, Ideal→Promedio, Promedio→Sobrepeso por grupo de edad.
const FAT_CUT: Record<Sex, [number, number, number][]> = {
  male: [
    [9.5, 15.1, 21.8],
    [10.5, 16.2, 22.8],
    [11.6, 17.2, 23.9],
    [12.7, 18.3, 25.0],
    [13.7, 19.4, 26.5],
    [15.4, 21.3, 27.6],
    [17.9, 23.1, 29.1],
    [19.0, 24.2, 30.1],
    [20.0, 25.2, 31.2],
  ],
  female: [
    [18.7, 24.0, 29.6],
    [19.3, 24.6, 30.2],
    [20.0, 25.3, 31.5],
    [20.5, 25.9, 32.6],
    [21.2, 26.5, 33.2],
    [22.8, 27.9, 34.4],
    [24.3, 29.3, 35.5],
    [25.0, 30.0, 36.1],
    [25.5, 30.5, 36.7],
  ],
};
export const fatCuts = (sex: Sex, age: number | null) =>
  FAT_CUT[sex][
    Math.max(
      0,
      AGE_LIMITS.findIndex((l) => (age ?? 30) <= l),
    )
  ];

export type FatClass = 'thin' | 'ok' | 'warn' | 'bad' | 'na';
export const FAT_LABEL: Record<FatClass, string> = {
  thin: 'Delgado',
  ok: 'Ideal',
  warn: 'Promedio',
  bad: 'Sobrepeso',
  na: 'Sin datos',
};
export function clsFat(pct: number | null, sex: Sex, age: number | null): FatClass {
  if (pct == null) return 'na';
  const [a, b, c] = fatCuts(sex, age);
  return pct < a ? 'thin' : pct < b ? 'ok' : pct < c ? 'warn' : 'bad';
}

// Sitios de Jackson & Pollock 3 pliegues.
export const FOLD_SITES: Record<Sex, { id: string; label: string; how: string }[]> = {
  male: [
    { id: 'pecho', label: 'Pecho', how: 'Diagonal, entre el pezón y la parte frontal de la axila.' },
    { id: 'abdomen', label: 'Abdomen', how: 'Vertical, 2 cm a la derecha del ombligo.' },
    { id: 'muslo', label: 'Muslo', how: 'Vertical, en el centro del muslo.' },
  ],
  female: [
    { id: 'triceps', label: 'Tríceps', how: 'Vertical, parte posterior del brazo, entre hombro y codo.' },
    { id: 'suprailiaco', label: 'Suprailíaco', how: 'Diagonal, justo sobre el hueso de la cadera.' },
    { id: 'muslo', label: 'Muslo', how: 'Vertical, en el centro del muslo.' },
  ],
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Jackson & Pollock 3 pliegues → densidad corporal → % grasa (Siri).
export function bodyFat(f: FoldRecord, birth: string | null) {
  const means = FOLD_SITES[f.sex].map((s) => avg(f.sites[s.id] ?? []));
  const age = ageAt(birth, f.date);
  if (means.some((m) => m == null) || age == null) return { sum: null, density: null, pct: null, age };
  const sum = (means as number[]).reduce((a, b) => a + b, 0);
  const density =
    f.sex === 'female'
      ? 1.0994921 - 0.0009929 * sum + 0.0000023 * sum * sum - 0.0001392 * age
      : 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * age;
  return { sum, density, pct: (4.95 / density - 4.5) * 100, age };
}

// Peso más cercano (hasta 14 días) a una fecha de pliegues, para la composición corporal.
export function weightNear(records: TapeRecord[], date: string): number | null {
  const day = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const r of records) {
    if (r.weightKg == null) continue;
    const d = Math.abs(day(r.date) - day(date));
    if (d <= 14 && d < bestDiff) {
      best = r.weightKg;
      bestDiff = d;
    }
  }
  return best;
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const fmtNum = (n: number | null, digits = 1) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString('es-CL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
