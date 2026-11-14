import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { type FoldRecord, parseBody, type StoredBody as Stored, type TapeRecord } from '@/domain/body';
import { loadSafely, persistSafely } from '@/lib/safeStore';

const BODY_KEY = 'body.v1';

type BodyState = Stored & {
  loading: boolean;
  /** La carga dejó registros fuera o no se pudo leer: lo que falta NO son borrados de la persona. */
  uncertain: boolean;
  // Sin id = registro nuevo (el id se genera aquí).
  saveRecord: (r: WithOptionalId<TapeRecord>) => void;
  saveFold: (f: WithOptionalId<FoldRecord>) => void;
  remove: (kind: 'record' | 'fold', id: string) => void;
  clearBody: () => void;
  /** Combina los registros de la nube con los del teléfono y quita los borrados. */
  importBody: (records: TapeRecord[], folds: FoldRecord[], deletedIds: string[]) => void;
};

type WithOptionalId<T extends { id: string }> = Omit<T, 'id'> & { id?: string };
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const BodyContext = createContext<BodyState | null>(null);
const byDateDesc = <T extends { date: string }>(xs: T[]) => [...xs].sort((a, b) => b.date.localeCompare(a.date));
const upsert = <T extends { id: string; date: string }>(xs: T[], x: T) =>
  byDateDesc([x, ...xs.filter((y) => y.id !== x.id)]);

const mergeById = <T extends { id: string; date: string }>(incoming: T[], current: T[], deletedIds: string[]) => {
  const merged = new Map([...incoming, ...current].map((x) => [x.id, x]));
  deletedIds.forEach((id) => merged.delete(id));
  return byDateDesc([...merged.values()]);
};

export function BodyProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Stored>({ records: [], folds: [] });
  const [loading, setLoading] = useState(true);
  const [load, setLoad] = useState({ safe: false, dropped: 0 });

  useEffect(() => {
    loadSafely(AsyncStorage, BODY_KEY, parseBody)
      .then((res) => {
        const base = res.value ?? { records: [], folds: [] };
        setData({
          records: mergeById(base.records, res.pending?.records ?? [], []),
          folds: mergeById(base.folds, res.pending?.folds ?? [], []),
        });
        setLoad({ safe: res.safe, dropped: res.dropped });
        if (res.dropped || !res.safe) {
          console.warn(`Medidas: ${res.dropped} sin leer, carga ${res.safe ? 'con copia' : 'no segura'}`);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Solo después de la carga inicial; si no fue segura, se guarda aparte y body.v1 no se toca.
  useEffect(() => {
    if (!loading) persistSafely(AsyncStorage, BODY_KEY, data, load.safe).catch(() => {});
  }, [data, loading, load.safe]);

  const saveRecord = useCallback((r: WithOptionalId<TapeRecord>) => {
    const rec = { ...r, id: r.id ?? newId('r') };
    setData((d) => ({ ...d, records: upsert(d.records, rec) }));
  }, []);
  const saveFold = useCallback((f: WithOptionalId<FoldRecord>) => {
    const fold = { ...f, id: f.id ?? newId('f') };
    setData((d) => ({ ...d, folds: upsert(d.folds, fold) }));
  }, []);
  const remove = useCallback(
    (kind: 'record' | 'fold', id: string) =>
      setData((d) =>
        kind === 'record'
          ? { ...d, records: d.records.filter((r) => r.id !== id) }
          : { ...d, folds: d.folds.filter((f) => f.id !== id) },
      ),
    [],
  );

  const clearBody = useCallback(() => setData({ records: [], folds: [] }), []);

  const importBody = useCallback(
    (records: TapeRecord[], folds: FoldRecord[], deletedIds: string[]) =>
      setData((d) => ({
        records: mergeById(records, d.records, deletedIds),
        folds: mergeById(folds, d.folds, deletedIds),
      })),
    [],
  );

  return (
    <BodyContext.Provider value={{ ...data, loading, uncertain: !load.safe || load.dropped > 0, saveRecord, saveFold, remove, clearBody, importBody }}>
      {children}
    </BodyContext.Provider>
  );
}

export function useBody() {
  const ctx = useContext(BodyContext);
  if (!ctx) throw new Error('useBody debe usarse dentro de <BodyProvider>');
  return ctx;
}
