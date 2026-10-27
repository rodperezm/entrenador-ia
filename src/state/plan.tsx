import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { type DayConfig, type DayOfWeek, StoredWeekPlan, WeekConfig } from '@/domain/schema';
import { applyDayChoice, type DayChoice, dayChoiceOf, defaultWeekConfig, sameChoice } from '@/domain/week';

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
};

const PlanContext = createContext<PlanState | null>(null);

async function load<T>(key: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as T) : null;
  } catch {
    return null;
  }
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [week, setWeek] = useState<WeekConfig>(defaultWeekConfig);
  const [plan, setPlan] = useState<StoredWeekPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([load<WeekConfig>(WEEK_KEY, WeekConfig), load<StoredWeekPlan>(PLAN_KEY, StoredWeekPlan)]).then(
      ([w, p]) => {
        if (w) setWeek(w);
        setPlan(p);
        setLoading(false);
      },
    );
  }, []);

  const updateDay = useCallback((day: DayOfWeek, patch: (d: DayConfig) => DayConfig) => {
    setWeek((prev) => {
      const next = { days: prev.days.map((d) => (d.day === day ? patch(d) : d)) };
      AsyncStorage.setItem(WEEK_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const applyDayChoices = useCallback((choices: Partial<Record<DayOfWeek, DayChoice>>) => {
    setWeek((prev) => {
      const next = {
        days: prev.days.map((d) => {
          const c = choices[d.day];
          return !c || sameChoice(dayChoiceOf(d), c) ? d : applyDayChoice(d, c);
        }),
      };
      AsyncStorage.setItem(WEEK_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const updateAllDays = useCallback((patch: (d: DayConfig) => DayConfig) => {
    setWeek((prev) => {
      const next = { days: prev.days.map(patch) };
      AsyncStorage.setItem(WEEK_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const savePlan = useCallback(async (p: StoredWeekPlan) => {
    await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(p));
    setPlan(p);
  }, []);

  return (
    <PlanContext.Provider value={{ week, plan, loading, updateDay, updateAllDays, applyDayChoices, savePlan }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan debe usarse dentro de <PlanProvider>');
  return ctx;
}
