import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { type DayConfig, type DayOfWeek, PlannedByWeek, StoredWeekPlan, WeekConfig } from '@/domain/schema';
import { plannedThisWeek, setPlannedHistory, weekKey } from '@/domain/cycle';
import { withEvenAlternating } from '@/domain/sides';
import { backupBeforeOverwrite, loadSafely, parseWhole } from '@/lib/safeStore';
import {
  applyDayChoice,
  type DayChoice,
  dayChoiceOf,
  defaultWeekConfig,
  normalizeDay,
  sameChoice,
} from '@/domain/week';

const WEEK_KEY = 'week-config.v1';
const PLAN_KEY = 'week-plan.v1';
// Cuándo cambió cada uno en este teléfono. Van en claves aparte para no tocar el formato guardado
// (la huella de la semana se calcula sobre su contenido). El respaldo las usa para saber cuál es más nuevo.
const WEEK_AT_KEY = 'week-config.updatedAt';
const PLAN_AT_KEY = 'week-plan.updatedAt';
// Días de Fuerza planificados cada semana: con eso el ciclo sabe si una semana pasada se cumplió.
const PLANNED_KEY = 'week-planned.v1';

type PlanState = {
  week: WeekConfig;
  plan: StoredWeekPlan | null;
  loading: boolean;
  /** Última vez que la semana o la rutina cambiaron en este teléfono (null = no se sabe). */
  weekUpdatedAt: string | null;
  planUpdatedAt: string | null;
  updateDay: (day: DayOfWeek, patch: (d: DayConfig) => DayConfig) => void;
  updateAllDays: (patch: (d: DayConfig) => DayConfig) => void;
  /** Aplica las partes elegidas a cada día; los días que ya las tienen no se tocan. */
  applyDayChoices: (choices: Partial<Record<DayOfWeek, DayChoice>>) => void;
  savePlan: (p: StoredWeekPlan) => Promise<void>;
  /** Vuelve a la semana inicial y borra la rutina guardada. */
  resetPlan: () => Promise<void>;
  /** Trae la semana y la rutina de la nube, con la fecha que tenían allá. */
  importPlan: (
    w: WeekConfig | null,
    p: StoredWeekPlan | null,
    at?: { week?: string | null; plan?: string | null },
  ) => Promise<void>;
};

const PlanContext = createContext<PlanState | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [week, setWeek] = useState<WeekConfig>(defaultWeekConfig);
  const [plan, setPlan] = useState<StoredWeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekUpdatedAt, setWeekUpdatedAt] = useState<string | null>(null);
  const [planUpdatedAt, setPlanUpdatedAt] = useState<string | null>(null);
  // Hasta terminar la carga no se escribe: se guardaría la semana por defecto sobre la real.
  const loaded = useRef(false);
  const plannedRef = useRef<Record<string, number>>({});
  const weekRef = useRef(week);
  useEffect(() => {
    weekRef.current = week;
  }, [week]);
  // Claves cuya carga no dejó copia de lo que había: antes de escribirlas se reintenta la copia.
  const unsafe = useRef(new Set<string>());

  // Suma lo que venga de la rutina guardada o del respaldo; lo anotado en este teléfono manda.
  const mergePlanned = useCallback((extra: unknown) => {
    const parsed = PlannedByWeek.safeParse(extra);
    if (!parsed.success || !Object.keys(parsed.data).length) return;
    const next = { ...parsed.data, ...plannedRef.current };
    if (Object.keys(next).length === Object.keys(plannedRef.current).length) return;
    plannedRef.current = next;
    setPlannedHistory(next);
    AsyncStorage.setItem(PLANNED_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const write = useCallback(async (key: string, value: unknown) => {
    if (unsafe.current.has(key)) {
      await backupBeforeOverwrite(AsyncStorage, key);
      unsafe.current.delete(key);
    }
    await AsyncStorage.setItem(key, JSON.stringify(value));
  }, []);
  const stamp = useCallback((key: string, set: (at: string | null) => void, at: string | null) => {
    set(at);
    (at ? AsyncStorage.setItem(key, at) : AsyncStorage.removeItem(key)).catch(() => {});
  }, []);
  // `touch`: la persona cambió la semana (no es solo un ajuste de formato al cargar).
  const saveWeek = useCallback(
    (next: WeekConfig, touch = true) => {
      void write(WEEK_KEY, next).catch(() => {});
      if (touch) stamp(WEEK_AT_KEY, setWeekUpdatedAt, new Date().toISOString());
    },
    [stamp, write],
  );

  useEffect(() => {
    // Lo que no se entiende (por ejemplo, tras un cambio de formato) queda copiado en `.bak`.
    Promise.all([
      loadSafely(AsyncStorage, WEEK_KEY, parseWhole(WeekConfig)),
      loadSafely(AsyncStorage, PLAN_KEY, parseWhole(StoredWeekPlan)),
      AsyncStorage.getItem(WEEK_AT_KEY).catch(() => null),
      AsyncStorage.getItem(PLAN_AT_KEY).catch(() => null),
      AsyncStorage.getItem(PLANNED_KEY).catch(() => null),
    ]).then(([weekRes, planRes, weekAt, planAt, plannedRaw]) => {
      try {
        const planned = PlannedByWeek.safeParse(JSON.parse(plannedRaw ?? '{}'));
        if (planned.success) {
          plannedRef.current = planned.data;
          setPlannedHistory(planned.data);
        }
      } catch {
        // Sin registro: el ciclo usa la configuración de hoy, como antes.
      }
      mergePlanned(planRes.value?.plannedByWeek);
      setWeekUpdatedAt(weekAt);
      setPlanUpdatedAt(planAt);
      if (!weekRes.safe) unsafe.current.add(WEEK_KEY);
      if (!planRes.safe) unsafe.current.add(PLAN_KEY);
      const w = weekRes.value;
      const p = planRes.value;
      loaded.current = true;
      if (w) {
        const fixed = { days: w.days.map(normalizeDay) };
        setWeek(fixed);
        if (fixed.days.some((d, i) => d !== w.days[i])) {
          saveWeek(fixed, false);
        }
      }
      setPlan(p && withEvenAlternating(p)); // la semana ya armada también
      setLoading(false);
    });
  }, [mergePlanned, saveWeek]);

  const updateDay = useCallback(
    (day: DayOfWeek, patch: (d: DayConfig) => DayConfig) => {
      setWeek((prev) => {
        if (!loaded.current) return prev;
        const next = { days: prev.days.map((d) => (d.day === day ? patch(d) : d)) };
        saveWeek(next);
        return next;
      });
    },
    [saveWeek],
  );

  const applyDayChoices = useCallback(
    (choices: Partial<Record<DayOfWeek, DayChoice>>) => {
      setWeek((prev) => {
        if (!loaded.current) return prev;
        const next = {
          days: prev.days.map((d) => {
            const c = choices[d.day];
            return !c || sameChoice(dayChoiceOf(d), c) ? d : applyDayChoice(d, c);
          }),
        };
        saveWeek(next);
        return next;
      });
    },
    [saveWeek],
  );

  const updateAllDays = useCallback(
    (patch: (d: DayConfig) => DayConfig) => {
      setWeek((prev) => {
        if (!loaded.current) return prev;
        const next = { days: prev.days.map(patch) };
        saveWeek(next);
        return next;
      });
    },
    [saveWeek],
  );

  // Venga de las reglas o de la IA, los alternados quedan en número par (ver evenAlternatingReps).
  const savePlan = useCallback(
    async (raw: StoredWeekPlan) => {
      // Deja anotado cuántos días de Fuerza tiene esta semana, para juzgarla después con eso.
      plannedRef.current = { ...plannedRef.current, [weekKey()]: plannedThisWeek(weekRef.current.days) };
      setPlannedHistory(plannedRef.current);
      AsyncStorage.setItem(PLANNED_KEY, JSON.stringify(plannedRef.current)).catch(() => {});
      const p = { ...withEvenAlternating(raw), plannedByWeek: plannedRef.current };
      await write(PLAN_KEY, p);
      setPlan(p);
      stamp(PLAN_AT_KEY, setPlanUpdatedAt, new Date().toISOString());
    },
    [stamp, write],
  );

  const resetPlan = useCallback(async () => {
    await AsyncStorage.multiRemove([WEEK_KEY, PLAN_KEY, WEEK_AT_KEY, PLAN_AT_KEY, PLANNED_KEY]);
    plannedRef.current = {};
    setPlannedHistory({});
    setWeekUpdatedAt(null);
    setPlanUpdatedAt(null);
    setWeek(defaultWeekConfig());
    setPlan(null);
  }, []);

  const importPlan = useCallback(
    async (w: WeekConfig | null, p: StoredWeekPlan | null, at: { week?: string | null; plan?: string | null } = {}) => {
      if (w) {
        const fixed = { days: w.days.map(normalizeDay) };
        await write(WEEK_KEY, fixed);
        setWeek(fixed);
        stamp(WEEK_AT_KEY, setWeekUpdatedAt, at.week ?? null);
      }
      if (p) {
        mergePlanned(p.plannedByWeek);
        await write(PLAN_KEY, p);
        setPlan(p);
        stamp(PLAN_AT_KEY, setPlanUpdatedAt, at.plan ?? null);
      }
    },
    [mergePlanned, stamp, write],
  );

  return (
    <PlanContext.Provider
      value={{
        week,
        plan,
        loading,
        weekUpdatedAt,
        planUpdatedAt,
        updateDay,
        updateAllDays,
        applyDayChoices,
        savePlan,
        resetPlan,
        importPlan,
      }}
    >
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan debe usarse dentro de <PlanProvider>');
  return ctx;
}
