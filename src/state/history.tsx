import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { WorkoutSession } from '@/domain/schema';
import { loadSafely, persistSafely, salvageList } from '@/lib/safeStore';

const HISTORY_KEY = 'history.v1';

const newestFirst = (xs: WorkoutSession[]) => [...xs].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
// Une dos listas por id; ante el mismo id gana la de `base`.
const mergeSessions = (base: WorkoutSession[], extra: WorkoutSession[]) =>
  newestFirst([...new Map([...extra, ...base].map((s) => [s.id, s])).values()]);

type HistoryState = {
  sessions: WorkoutSession[]; // la más reciente primero
  loading: boolean;
  /** La carga dejó registros fuera o no se pudo leer: lo que falta NO son borrados de la persona. */
  uncertain: boolean;
  addSession: (s: WorkoutSession) => void;
  /** Agrega datos a una sesión ya guardada (cómo estuvo, seguimiento del dolor). */
  updateSession: (id: string, patch: Partial<WorkoutSession>) => void;
  /** Quita una sesión guardada sin querer; el respaldo la marca como borrada en la nube. */
  removeSession: (id: string) => void;
  clearHistory: () => void;
  /** Combina las sesiones de la nube con las del teléfono y quita las borradas. */
  importSessions: (incoming: WorkoutSession[], deletedIds: string[]) => void;
};

const HistoryContext = createContext<HistoryState | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  // Cómo terminó la carga inicial: decide dónde se guarda y si el respaldo puede confiar en lo que falta.
  const [load, setLoad] = useState({ safe: false, dropped: 0 });

  // Se revisa sesión por sesión: una inválida no bota a las demás, y antes de descartarla queda
  // una copia del original en history.v1.bak (ver lib/safeStore).
  useEffect(() => {
    loadSafely(AsyncStorage, HISTORY_KEY, (json) => salvageList(json, WorkoutSession))
      .then((res) => {
        setSessions(mergeSessions(res.value ?? [], res.pending ?? []));
        setLoad({ safe: res.safe, dropped: res.dropped });
        if (res.dropped || !res.safe) {
          console.warn(`Historial: ${res.dropped} sin leer, carga ${res.safe ? 'con copia' : 'no segura'}`);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Guardar cada vez que cambia, solo después de la carga inicial. Si esa carga no fue segura,
  // se guarda aparte y history.v1 no se toca.
  useEffect(() => {
    if (!loading) persistSafely(AsyncStorage, HISTORY_KEY, sessions, load.safe).catch(() => {});
  }, [sessions, loading, load.safe]);

  // Por id: guardar dos veces la misma sesión (doble toque) no la duplica.
  const addSession = useCallback(
    (s: WorkoutSession) => setSessions((prev) => [s, ...prev.filter((x) => x.id !== s.id)]),
    [],
  );
  const updateSession = useCallback(
    (id: string, patch: Partial<WorkoutSession>) =>
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))),
    [],
  );

  const removeSession = useCallback((id: string) => setSessions((prev) => prev.filter((s) => s.id !== id)), []);
  const clearHistory = useCallback(() => setSessions([]), []);

  const importSessions = useCallback(
    (incoming: WorkoutSession[], deletedIds: string[]) =>
      setSessions((prev) => {
        const merged = new Map([...incoming, ...prev].map((s) => [s.id, s]));
        deletedIds.forEach((id) => merged.delete(id));
        return [...merged.values()].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
      }),
    [],
  );

  return (
    <HistoryContext.Provider
      value={{
        sessions,
        loading,
        uncertain: !load.safe || load.dropped > 0,
        addSession,
        updateSession,
        removeSession,
        clearHistory,
        importSessions,
      }}
    >
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory debe usarse dentro de <HistoryProvider>');
  return ctx;
}
