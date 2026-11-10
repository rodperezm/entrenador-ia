import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { type DayConfig, type DayOfWeek, StoredWeekPlan, WeekConfig } from '@/domain/schema';
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

type PlanState = {
  week: WeekConfig;
  plan: StoredWeekPlan | null;
  loading: boolean;
  updateDay: (day: DayOfWeek, patch: (d: DayConfig) => DayConfig) => void;
  updateAllDays: (patch: (d: DayConfig) => DayConfig) => void;
  /** Aplica las partes elegidas a cada día; los días que ya las tienen no se tocan. */
  applyDayChoices: (choices: Partial<Record<DayOfWeek, DayChoice>>) => void;
  savePlan: (p: StoredWeekPlan) => Promise<void>;
  /** Vuelve a la semana inicial y borra la rutina guardada. */
  resetPlan: () => Promise<void>;
  /** Trae la semana y la rutina de la nube. */
  importPlan: (w: WeekConfig | null, p: StoredWeekPlan | null) => Promise<void>;
};

const PlanContext = createContext<PlanState | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [week, setWeek] = useState<WeekConfig>(defaultWeekConfig);
  const [plan, setPlan] = useState<StoredWeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  // Hasta terminar la carga no se escribe: se guardaría la semana por defecto sobre la real.
  const loaded = useRef(false);
  // Claves cuya carga no dejó copia de lo que había: antes de escribirlas se reintenta la copia.
  const unsafe = useRef(new Set<string>());

  const write = useCallback(async (key: string, value: unknown) => {
    if (unsafe.current.has(key)) {
      await backupBeforeOverwrite(AsyncStorage, key);
      unsafe.current.delete(key);
    }
    await AsyncStorage.setItem(key, JSON.stringify(value));
  }, []);
  const saveWeek = useCallback((next: WeekConfig) => void write(WEEK_KEY, next).catch(() => {}), [write]);

  useEffect(() => {
    // Lo que no se entiende (por ejemplo, tras un cambio de formato) queda copiado en `.bak`.
    Promise.all([
      loadSafely(AsyncStorage, WEEK_KEY, parseWhole(WeekConfig)),
      loadSafely(AsyncStorage, PLAN_KEY, parseWhole(StoredWeekPlan)),
    ]).then(([weekRes, planRes]) => {
      if (!weekRes.safe) unsafe.current.add(WEEK_KEY);
      if (!planRes.safe) unsafe.current.add(PLAN_KEY);
      const w = weekRes.value;
      const p = planRes.value;
      loaded.current = true;
      if (w) {
        const fixed = { days: w.days.map(normalizeDay) };
        setWeek(fixed);
        if (fixed.days.some((d, i) => d !== w.days[i])) {
          saveWeek(fixed);
        }
      }
      setPlan(p && withEvenAlternating(p)); // la semana ya armada también
      setLoading(false);
    });
  }, [saveWeek]);

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
      const p = withEvenAlternating(raw);
      await write(PLAN_KEY, p);
      setPlan(p);
    },
    [write],
  );

  const resetPlan = useCallback(async () => {
    await AsyncStorage.multiRemove([WEEK_KEY, PLAN_KEY]);
    setWeek(defaultWeekConfig());
    setPlan(null);
  }, []);

  const importPlan = useCallback(
    async (w: WeekConfig | null, p: StoredWeekPlan | null) => {
      if (w) {
        const fixed = { days: w.days.map(normalizeDay) };
        await write(WEEK_KEY, fixed);
        setWeek(fixed);
      }
      if (p) {
        await write(PLAN_KEY, p);
        setPlan(p);
      }
    },
    [write],
  );

  return (
    <PlanContext.Provider
      value={{ week, plan, loading, updateDay, updateAllDays, applyDayChoices, savePlan, resetPlan, importPlan }}
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
