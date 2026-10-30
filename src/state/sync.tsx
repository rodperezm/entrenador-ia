import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { z } from 'zod';
import { FoldRecord, TapeRecord } from '@/domain/body';
import { LocalProfile, StoredWeekPlan, WeekConfig, WorkoutSession } from '@/domain/schema';
import { type CloudItem, deleteAccount, itemKey, pullItems, pushItems } from '@/lib/cloudSync';
import { ensureSession, supabase } from '@/lib/supabase';
import { useBody } from './body';
import { useHistory } from './history';
import { usePlan } from './plan';
import { useProfile } from './profile';

// Respaldo voluntario. El teléfono sigue siendo la fuente principal: nada sube sin
// consentimiento, y lo que no se pudo subir se reintenta en el siguiente cambio o
// al volver a la app. Solo se envía lo que cambió desde la última vez.

const CONSENT_KEY = 'cloud-consent.v1';
const SENT_KEY = 'cloud-sent.v1';
const PUSH_DELAY_MS = 2000;

const Consent = z.object({ acceptedAt: z.string() });
type Status = 'off' | 'syncing' | 'ok' | 'pending';
type Sent = Record<string, string>;

type SyncState = {
  enabled: boolean;
  status: Status;
  email: string | null;
  lastSyncAt: string | null;
  /** Activa el respaldo: combina lo que haya en la nube y sube lo del teléfono. */
  enable: () => Promise<void>;
  syncNow: () => Promise<void>;
  /** Deja de sincronizar en este teléfono; la nube y lo local no se tocan. */
  signOut: () => Promise<void>;
  /** Borra la cuenta y su respaldo; lo del teléfono no se toca. */
  removeAccount: () => Promise<void>;
  exportData: () => string;
};

const SyncContext = createContext<SyncState | null>(null);

const parseAll = <T,>(items: CloudItem[], kind: CloudItem['kind'], schema: z.ZodType<T>) =>
  items.flatMap((i) => {
    if (i.kind !== kind || i.deleted) return [];
    const parsed = schema.safeParse(i.data);
    return parsed.success ? [parsed.data] : [];
  });

export function SyncProvider({ children }: { children: ReactNode }) {
  const { profile, loading: profileLoading, importProfile } = useProfile();
  const { week, plan, loading: planLoading, importPlan } = usePlan();
  const { sessions, loading: historyLoading, importSessions } = useHistory();
  const { records, folds, loading: bodyLoading, importBody } = useBody();
  const [enabled, setEnabled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState<Status>('off');
  const [email, setEmail] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const merged = useRef(false);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loading = profileLoading || planLoading || historyLoading || bodyLoading || !checked;

  const items = useMemo<CloudItem[]>(() => {
    const doc = (kind: CloudItem['kind'], item_id: string, data: unknown): CloudItem => ({
      kind,
      item_id,
      data,
      deleted: false,
    });
    return [
      ...(profile ? [doc('profile', 'me', profile)] : []),
      ...(profile ? [doc('week', 'me', week)] : []),
      ...(plan ? [doc('plan', 'me', plan)] : []),
      ...sessions.map((s) => doc('session', s.id, s)),
      ...records.map((r) => doc('tape', r.id, r)),
      ...folds.map((f) => doc('fold', f.id, f)),
    ];
  }, [profile, week, plan, sessions, records, folds]);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const push = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus('syncing');
    try {
      const sent: Sent = JSON.parse((await AsyncStorage.getItem(SENT_KEY)) ?? '{}');
      const current = new Map(itemsRef.current.map((i) => [itemKey(i), i]));
      const changed = [...current].filter(([key, i]) => sent[key] !== JSON.stringify(i.data)).map(([, i]) => i);
      // Lo que ya subió y dejó de existir en el teléfono se marca como borrado.
      const removed = Object.keys(sent)
        .filter((key) => !current.has(key))
        .map((key) => {
          const [kind, ...id] = key.split(':');
          return { kind: kind as CloudItem['kind'], item_id: id.join(':'), data: null, deleted: true };
        });
      await pushItems([...changed, ...removed]);
      const next: Sent = Object.fromEntries([...current].map(([key, i]) => [key, JSON.stringify(i.data)]));
      await AsyncStorage.setItem(SENT_KEY, JSON.stringify(next));
      setLastSyncAt(new Date().toISOString());
      setStatus('ok');
    } catch {
      setStatus('pending');
    } finally {
      busy.current = false;
    }
  }, []);

  // Trae lo que hay en la nube. El perfil, la semana y la rutina de la nube mandan;
  // sesiones y medidas se combinan para no perder nada de ningún teléfono.
  const pull = useCallback(async () => {
    const cloud = await pullItems();
    const deletedIds = cloud.filter((i) => i.deleted).map((i) => i.item_id);
    importSessions(parseAll(cloud, 'session', WorkoutSession), deletedIds);
    importBody(parseAll(cloud, 'tape', TapeRecord), parseAll(cloud, 'fold', FoldRecord), deletedIds);
    const cloudProfile = parseAll(cloud, 'profile', LocalProfile)[0];
    if (cloudProfile) await importProfile(cloudProfile);
    await importPlan(
      parseAll(cloud, 'week', WeekConfig)[0] ?? null,
      parseAll(cloud, 'plan', StoredWeekPlan)[0] ?? null,
    );
    merged.current = true;
  }, [importBody, importPlan, importProfile, importSessions]);

  const syncNow = useCallback(async () => {
    setStatus('syncing');
    try {
      await pull();
      await push();
    } catch {
      setStatus('pending');
    }
  }, [pull, push]);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(CONSENT_KEY), supabase.auth.getUser().catch(() => null)])
      .then(([raw, auth]) => {
        const user = auth?.data.user;
        if (raw && Consent.safeParse(JSON.parse(raw)).success) setEnabled(true);
        if (user && !user.is_anonymous) setEmail(user.email ?? null);
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);

  // Al abrir con respaldo activo, primero se trae lo de la nube.
  useEffect(() => {
    if (enabled && !loading && !merged.current) syncNow();
  }, [enabled, loading, syncNow]);

  // Cada cambio local se sube unos segundos después.
  useEffect(() => {
    if (!enabled || loading || !merged.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(push, PUSH_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, items, loading, push]);

  // Reintenta al volver a la app, por si antes no había internet.
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && merged.current) push();
    });
    return () => sub.remove();
  }, [enabled, push]);

  const enable = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    await AsyncStorage.removeItem(SENT_KEY);
    await pull();
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify({ acceptedAt: new Date().toISOString() }));
    setEmail(data.user?.email ?? null);
    setEnabled(true);
  }, [pull]);

  const stop = useCallback(async () => {
    await AsyncStorage.multiRemove([CONSENT_KEY, SENT_KEY]);
    merged.current = false;
    setEnabled(false);
    setEmail(null);
    setStatus('off');
    setLastSyncAt(null);
  }, []);

  const signOut = useCallback(async () => {
    await stop();
    await supabase.auth.signOut({ scope: 'local' });
    await ensureSession().catch(() => {});
  }, [stop]);

  const removeAccount = useCallback(async () => {
    await deleteAccount();
    await stop();
    await ensureSession().catch(() => {});
  }, [stop]);

  const exportData = useCallback(
    () =>
      JSON.stringify(
        { exportedAt: new Date().toISOString(), profile, week, plan, sessions, records, folds },
        null,
        2,
      ),
    [profile, week, plan, sessions, records, folds],
  );

  return (
    <SyncContext.Provider
      value={{ enabled, status, email, lastSyncAt, enable, syncNow, signOut, removeAccount, exportData }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync debe usarse dentro de <SyncProvider>');
  return ctx;
}
