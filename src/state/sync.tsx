import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { z } from 'zod';
import { FoldRecord, TapeRecord } from '@/domain/body';
import { LocalProfile, StoredWeekPlan, WeekConfig, WorkoutSession } from '@/domain/schema';
import { chooseDoc } from '@/domain/syncMerge';
import { clearDraft } from '@/features/workout/draft';
import { type CloudItem, deleteAccount, itemKey, pullItems, pushItems } from '@/lib/cloudSync';
import { hashData, parseSent, type Sent } from '@/lib/itemHash';
import { CLOUD_CONSENT_KEY, ensureSession, SessionLostError, sessionLost, supabase } from '@/lib/supabase';
import { useBody } from './body';
import { useHistory } from './history';
import { usePlan } from './plan';
import { useProfile } from './profile';

// Respaldo voluntario. El teléfono sigue siendo la fuente principal: nada sube sin
// consentimiento, y lo que no se pudo subir se reintenta en el siguiente cambio o
// al volver a la app. Solo se envía lo que cambió desde la última vez.

const CONSENT_KEY = CLOUD_CONSENT_KEY;
const SENT_KEY = 'cloud-sent.v1';
// Cuenta a la que pertenece lo guardado en este teléfono (la última que tuvo el respaldo activo).
const OWNER_KEY = 'cloud-owner.v1';
const PUSH_DELAY_MS = 2000;

const Consent = z.object({ acceptedAt: z.string() });
// signed_out: la sesión del correo se cerró; no se sube ni se trae nada hasta volver a entrar.
type Status = 'off' | 'syncing' | 'ok' | 'pending' | 'signed_out';

type SyncState = {
  /** Ya se revisó si este teléfono tiene respaldo activo. */
  ready: boolean;
  enabled: boolean;
  status: Status;
  email: string | null;
  lastSyncAt: string | null;
  /**
   * Activa el respaldo: combina lo que haya en la nube y sube lo del teléfono.
   * `existing`: se entró a una cuenta que ya existía. Si el teléfono guardaba datos de OTRA
   * cuenta, se reemplazan por los de esta en vez de mezclarse.
   */
  enable: (existing?: boolean) => Promise<void>;
  syncNow: () => Promise<void>;
  /** Deja de sincronizar en este teléfono; la nube y lo local no se tocan. */
  signOut: () => Promise<void>;
  /** La sesión se perdió: deja el respaldo listo para volver a entrar con el correo. */
  signInAgain: () => Promise<void>;
  /** Borra la cuenta y su respaldo; lo del teléfono no se toca. */
  removeAccount: () => Promise<void>;
  /** Cierra la sesión y borra todo lo guardado en este teléfono; el respaldo en la nube no se toca. */
  wipeLocal: () => Promise<void>;
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
  const { profile, loading: profileLoading, importProfile, clearProfile } = useProfile();
  const { week, plan, weekUpdatedAt, planUpdatedAt, loading: planLoading, importPlan, resetPlan } = usePlan();
  const {
    sessions,
    loading: historyLoading,
    uncertain: historyUncertain,
    importSessions,
    clearHistory,
  } = useHistory();
  const { records, folds, loading: bodyLoading, uncertain: bodyUncertain, importBody, clearBody } = useBody();
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
    // `at`: cuándo cambió en el teléfono; viaja como fecha de la fila para comparar al traer.
    const doc = (kind: CloudItem['kind'], item_id: string, data: unknown, at?: string | null): CloudItem => ({
      kind,
      item_id,
      data,
      deleted: false,
      ...(at ? { updated_at: at } : {}),
    });
    return [
      ...(profile ? [doc('profile', 'me', profile, profile.updatedAt)] : []),
      ...(profile ? [doc('week', 'me', week, weekUpdatedAt)] : []),
      ...(plan ? [doc('plan', 'me', plan, planUpdatedAt ?? plan.generatedAt)] : []),
      ...sessions.map((s) => doc('session', s.id, s)),
      ...records.map((r) => doc('tape', r.id, r)),
      ...folds.map((f) => doc('fold', f.id, f)),
    ];
  }, [profile, week, plan, weekUpdatedAt, planUpdatedAt, sessions, records, folds]);

  // Lo que hay ahora en el teléfono, para compararlo con la nube al traer el respaldo.
  const localRef = useRef({ profile, week, plan, weekUpdatedAt, planUpdatedAt });
  useEffect(() => {
    localRef.current = { profile, week, plan, weekUpdatedAt, planUpdatedAt };
  }, [profile, week, plan, weekUpdatedAt, planUpdatedAt]);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Si el teléfono no pudo leer bien su historial o sus medidas, lo que falta no es un borrado de la
  // persona: en esta apertura no se marca nada como borrado en la nube (se borraría en todos sus teléfonos).
  const uncertainRef = useRef(false);
  useEffect(() => {
    uncertainRef.current = historyUncertain || bodyUncertain;
  }, [historyUncertain, bodyUncertain]);

  const push = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus('syncing');
    try {
      if (await sessionLost()) {
        setStatus('signed_out');
        return;
      }
      // Por cada dato se guarda solo una huella corta, no otra copia completa (ver lib/itemHash).
      const sent = parseSent(await AsyncStorage.getItem(SENT_KEY));
      const current = new Map(itemsRef.current.map((i) => [itemKey(i), i]));
      const changed = [...current].filter(([key, i]) => sent[key] !== hashData(i.data)).map(([, i]) => i);
      // Lo que ya subió y dejó de existir en el teléfono se marca como borrado.
      const removed = (uncertainRef.current ? [] : Object.keys(sent))
        .filter((key) => !current.has(key))
        .map((key) => {
          const [kind, ...id] = key.split(':');
          return { kind: kind as CloudItem['kind'], item_id: id.join(':'), data: null, deleted: true };
        });
      await pushItems([...changed, ...removed]);
      const next: Sent = Object.fromEntries([...current].map(([key, i]) => [key, hashData(i.data)]));
      await AsyncStorage.setItem(SENT_KEY, JSON.stringify(next));
      setLastSyncAt(new Date().toISOString());
      setStatus('ok');
    } catch {
      setStatus('pending');
    } finally {
      busy.current = false;
    }
  }, []);

  // Trae lo que hay en la nube. Sesiones y medidas se combinan para no perder nada de ningún
  // teléfono. Perfil, semana y rutina: gana el más reciente, y lo del teléfono nunca se reemplaza
  // por algo más antiguo. `preferCloud`: al entrar a una cuenta que ya existe, manda la cuenta.
  // `replaceLocal`: lo del teléfono era de otra cuenta; no se combina, queda solo lo de esta.
  const pull = useCallback(
    async (preferCloud = false, replaceLocal = false) => {
      if (await sessionLost()) throw new SessionLostError();
      const cloud = await pullItems();
      if (replaceLocal) {
        clearHistory();
        clearBody();
        clearDraft();
      }
      const deletedIds = cloud.filter((i) => i.deleted).map((i) => i.item_id);
      importSessions(parseAll(cloud, 'session', WorkoutSession), deletedIds);
      importBody(parseAll(cloud, 'tape', TapeRecord), parseAll(cloud, 'fold', FoldRecord), deletedIds);
      const local = replaceLocal
        ? { profile: null, week: localRef.current.week, plan: null, weekUpdatedAt: null, planUpdatedAt: null }
        : localRef.current;
      const rowDate = (kind: CloudItem['kind']) => cloud.find((i) => i.kind === kind && !i.deleted)?.updated_at ?? null;
      const resend: string[] = [];
      const fromCloud = <T,>(
        kind: CloudItem['kind'],
        mine: T | null,
        theirs: T | null,
        mineAt?: string | null,
        theirsAt?: string | null,
      ) => {
        const choice = chooseDoc({ local: mine, cloud: theirs, localAt: mineAt, cloudAt: theirsAt, preferCloud });
        if (choice.resend) resend.push(itemKey({ kind, item_id: 'me' }));
        return choice.use === 'cloud' ? theirs : null;
      };

      const cloudProfile = parseAll(cloud, 'profile', LocalProfile)[0] ?? null;
      const newProfile = fromCloud(
        'profile',
        local.profile,
        cloudProfile,
        local.profile?.updatedAt,
        cloudProfile?.updatedAt,
      );
      if (newProfile) await importProfile(newProfile);
      else if (replaceLocal) await clearProfile();

      const cloudPlan = parseAll(cloud, 'plan', StoredWeekPlan)[0] ?? null;
      // Sin perfil, la semana del teléfono es la de fábrica: no compite con la de la cuenta.
      const newWeek = fromCloud(
        'week',
        local.profile ? local.week : null,
        parseAll(cloud, 'week', WeekConfig)[0] ?? null,
        local.weekUpdatedAt,
        rowDate('week'),
      );
      const newPlan = fromCloud(
        'plan',
        local.plan,
        cloudPlan,
        local.planUpdatedAt ?? local.plan?.generatedAt,
        rowDate('plan') ?? cloudPlan?.generatedAt,
      );
      if (replaceLocal) await resetPlan();
      await importPlan(newWeek, newPlan, { week: rowDate('week'), plan: rowDate('plan') });

      // Lo del teléfono que es más nuevo que la nube se vuelve a subir aunque ya se hubiera enviado.
      if (resend.length) {
        const sent = parseSent(await AsyncStorage.getItem(SENT_KEY));
        resend.forEach((key) => delete sent[key]);
        await AsyncStorage.setItem(SENT_KEY, JSON.stringify(sent));
      }
      merged.current = true;
    },
    [clearBody, clearHistory, clearProfile, importBody, importPlan, importProfile, importSessions, resetPlan],
  );

  const syncNow = useCallback(async () => {
    setStatus('syncing');
    try {
      await pull();
      await push();
    } catch (e) {
      setStatus(e instanceof SessionLostError ? 'signed_out' : 'pending');
    }
  }, [pull, push]);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(CONSENT_KEY), supabase.auth.getUser().catch(() => null)])
      .then(([raw, auth]) => {
        const user = auth?.data.user;
        if (raw && Consent.safeParse(JSON.parse(raw)).success) setEnabled(true);
        if (user && !user.is_anonymous) {
          setEmail(user.email ?? null);
          // Respaldos activados antes de que existiera esta marca.
          if (raw) AsyncStorage.setItem(OWNER_KEY, user.id).catch(() => {});
        }
        else if (raw) setStatus('signed_out');
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

  const enable = useCallback(
    async (existing = false) => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id ?? null;
      const owner = await AsyncStorage.getItem(OWNER_KEY).catch(() => null);
      const otherAccount = existing && !!owner && !!userId && owner !== userId;
      await AsyncStorage.removeItem(SENT_KEY);
      await pull(true, otherAccount);
      await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify({ acceptedAt: new Date().toISOString() }));
      if (userId) await AsyncStorage.setItem(OWNER_KEY, userId);
      setEmail(data.user?.email ?? null);
      setEnabled(true);
    },
    [pull],
  );

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

  const signInAgain = useCallback(async () => {
    await stop();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, [stop]);

  const removeAccount = useCallback(async () => {
    await deleteAccount();
    // Sin cuenta, lo que queda en el teléfono ya no pertenece a ninguna.
    await AsyncStorage.removeItem(OWNER_KEY).catch(() => {});
    await stop();
    await ensureSession().catch(() => {});
  }, [stop]);

  // Para un teléfono prestado o que se va a regalar. Primero se apaga el respaldo: si no, lo
  // borrado aquí se marcaría como borrado también en la nube.
  const wipeLocal = useCallback(async () => {
    await stop();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    clearHistory();
    clearBody();
    clearDraft();
    await resetPlan();
    await clearProfile();
    // Marcas del respaldo y copias de seguridad de lo que alguna vez no se pudo leer.
    const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
    const leftovers = keys.filter((k) => k === OWNER_KEY || /\.(bak(\.\d+)?|pending)$/.test(k));
    if (leftovers.length) await AsyncStorage.multiRemove(leftovers).catch(() => {});
  }, [clearBody, clearHistory, clearProfile, resetPlan, stop]);

  const exportData = useCallback(
    () =>
      JSON.stringify({ exportedAt: new Date().toISOString(), profile, week, plan, sessions, records, folds }, null, 2),
    [profile, week, plan, sessions, records, folds],
  );

  return (
    <SyncContext.Provider
      value={{
        ready: checked,
        enabled,
        status,
        email,
        lastSyncAt,
        enable,
        syncNow,
        signOut,
        signInAgain,
        removeAccount,
        wipeLocal,
        exportData,
      }}
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
