import { bodyFat, type FoldRecord, FOLD_SITES, type TapeRecord, TAPE_KEYS, type TapeKey, weightNear } from './body';

// Historial de Cuerpo: un día por fila, con todo lo medido ese día junto (peso, cinta y pliegues)
// y, para cada dato, cuánto cambió respecto de la medición anterior de ese mismo dato.

export type Change = { value: number; prev: number | null };

export type FoldDetail = {
  sites: { label: string; mm: number | null; prev: number | null }[];
  pct: Change | null;
  fatKg: number | null;
  leanKg: number | null;
};

export type HistoryDay = {
  date: string;
  recordIds: string[];
  foldIds: string[];
  tape: Partial<Record<TapeKey, Change>>;
  fold: FoldDetail | null;
};

const avg = (xs: number[] | undefined) => (xs && xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function historyDays(records: TapeRecord[], folds: FoldRecord[], birth: string | null): HistoryDay[] {
  const dates = [...new Set([...records, ...folds].map((r) => r.date))].sort((a, b) => b.localeCompare(a));
  const byDate = <T extends { date: string }>(xs: T[]) => [...xs].sort((a, b) => a.date.localeCompare(b.date));
  const recs = byDate(records);
  const fs = byDate(folds);

  return dates.map((date) => {
    const dayRecs = recs.filter((r) => r.date === date);
    const dayFolds = fs.filter((f) => f.date === date);

    // Lo último de cada medida ese día, y su valor anterior de otro día.
    const tape: Partial<Record<TapeKey, Change>> = {};
    for (const key of TAPE_KEYS) {
      const today = [...dayRecs].reverse().find((r) => r[key] != null);
      if (!today) continue;
      const before = [...recs].reverse().find((r) => r.date < date && r[key] != null);
      tape[key] = { value: today[key] as number, prev: (before?.[key] as number | undefined) ?? null };
    }

    let fold: FoldDetail | null = null;
    const f = dayFolds[dayFolds.length - 1];
    if (f) {
      const prevF = [...fs].reverse().find((x) => x.date < date && x.sex === f.sex) ?? null;
      const pct = bodyFat(f, birth).pct;
      const prevPct = prevF ? bodyFat(prevF, birth).pct : null;
      const weight = weightNear(records, date);
      fold = {
        sites: FOLD_SITES[f.sex].map((s) => ({ label: s.label, mm: avg(f.sites[s.id]), prev: prevF ? avg(prevF.sites[s.id]) : null })),
        pct: pct == null ? null : { value: pct, prev: prevPct },
        fatKg: pct != null && weight != null ? (weight * pct) / 100 : null,
        leanKg: pct != null && weight != null ? weight - (weight * pct) / 100 : null,
      };
    }

    return { date, recordIds: dayRecs.map((r) => r.id), foldIds: dayFolds.map((x) => x.id), tape, fold };
  });
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const weekday = (iso: string) => WEEKDAYS[new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()];
