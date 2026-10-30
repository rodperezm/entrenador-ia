import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { z } from 'zod';
import { WorkoutSession } from '@/domain/schema';

const HISTORY_KEY = 'history.v1';
const History = z.array(WorkoutSession);

type HistoryState = {
  sessions: WorkoutSession[]; // la más reciente primero
  loading: boolean;
  addSession: (s: WorkoutSession) => void;
  clearHistory: () => void;
  /** Combina las sesiones de la nube con las del teléfono y quita las borradas. */
  importSessions: (incoming: WorkoutSession[], deletedIds: string[]) => void;
};

const HistoryContext = createContext<HistoryState | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY)
      .then((raw) => {
        const parsed = raw ? History.safeParse(JSON.parse(raw)) : null;
        if (parsed?.success) setSessions(parsed.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Guardar cada vez que cambia (después de la carga inicial).
  useEffect(() => {
    if (!loading) AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(sessions)).catch(() => {});
  }, [sessions, loading]);

  const addSession = useCallback((s: WorkoutSession) => setSessions((prev) => [s, ...prev]), []);

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
    <HistoryContext.Provider value={{ sessions, loading, addSession, clearHistory, importSessions }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory debe usarse dentro de <HistoryProvider>');
  return ctx;
}
