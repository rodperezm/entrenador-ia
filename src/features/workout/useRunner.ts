import { useCallback, useEffect, useRef, useState } from 'react';

export type RunnerStatus = 'idle' | 'running' | 'paused' | 'done';

type Timing = { index: number; status: RunnerStatus; start: number; pausedMs: number; pausedAt: number | null };
const IDLE: Timing = { index: 0, status: 'idle', start: 0, pausedMs: 0, pausedAt: null };

const remainingOf = (t: Timing, durations: number[], now: number) => {
  const elapsed = ((t.pausedAt ?? now) - t.start - t.pausedMs) / 1000;
  return Math.max(0, (durations[t.index] ?? 0) - elapsed);
};

// Reloj de fases con duración fija. Como en el Tabata, el tiempo se calcula
// desde la marca de inicio de la fase (no restando de a un segundo), así no se
// desfasa si el teléfono se pone lento o la app pasa un momento a segundo plano.
export function useRunner(durations: number[]) {
  const [t, setT] = useState<Timing>(IDLE);
  const [now, setNow] = useState(0);

  const goTo = useCallback(
    (index: number, at: number) =>
      setT(
        index >= durations.length
          ? { ...IDLE, index, status: 'done' }
          : { index, status: 'running', start: at, pausedMs: 0, pausedAt: null },
      ),
    [durations.length],
  );

  // Copia de lo último para leerlo dentro del intervalo.
  const latest = useRef({ t, durations, goTo });
  useEffect(() => {
    latest.current = { t, durations, goTo };
  });

  useEffect(() => {
    if (t.status !== 'running') return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      const { t: cur, durations: d, goTo: go } = latest.current;
      if (cur.status === 'running' && remainingOf(cur, d, n) <= 0) go(cur.index + 1, n);
    }, 200);
    return () => clearInterval(id);
  }, [t.status]);

  const remainingSec =
    t.status === 'idle' ? (durations[0] ?? 0) : t.status === 'done' ? 0 : remainingOf(t, durations, now || t.start);

  const start = useCallback(() => {
    const n = Date.now();
    setNow(n);
    goTo(0, n);
  }, [goTo]);
  const skip = useCallback(() => {
    const n = Date.now();
    setNow(n);
    goTo(t.index + 1, n);
  }, [goTo, t.index]);
  const pause = useCallback(
    () => setT((cur) => (cur.status === 'running' ? { ...cur, status: 'paused', pausedAt: Date.now() } : cur)),
    [],
  );
  const resume = useCallback(
    () =>
      setT((cur) =>
        cur.status === 'paused' && cur.pausedAt != null
          ? { ...cur, status: 'running', pausedMs: cur.pausedMs + Date.now() - cur.pausedAt, pausedAt: null }
          : cur,
      ),
    [],
  );
  const reset = useCallback(() => setT(IDLE), []);

  return { index: t.index, status: t.status, remainingSec, start, skip, pause, resume, reset };
}
