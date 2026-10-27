import { type AudioPlayer, createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Phase } from '@/domain/session';
import { buildTabataWav, phaseStarts } from './tabataTrack';
import type { RunnerStatus } from './useRunner';

// Reloj del Tabata basado en la pista de audio (como el original): el tiempo
// transcurrido ES la posición de reproducción, así que lo que se ve y lo que
// suena siempre coinciden, aunque el teléfono se ponga lento.
export function useTrackRunner(phases: Phase[]) {
  const { starts, total } = useMemo(() => phaseStarts(phases), [phases]);
  const [status, setStatus] = useState<RunnerStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const player = useRef<AudioPlayer | null>(null);

  const release = useCallback(() => {
    try {
      player.current?.pause();
      player.current?.remove();
    } catch {}
    player.current = null;
  }, []);

  useEffect(() => release, [release]);

  // Leer la posición de la pista ~20 veces por segundo (cambio de número casi al mismo tiempo que el sonido).
  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => {
      const p = player.current;
      if (!p) return;
      const t = p.currentTime;
      setElapsed(t);
      if (t >= total) setStatus('done');
    }, 50);
    return () => clearInterval(id);
  }, [status, total]);

  const start = useCallback(async () => {
    release();
    setElapsed(0);
    setStatus('running');
    const file = new File(Paths.cache, 'tabata.wav');
    file.create({ overwrite: true });
    await file.write(buildTabataWav(phases));
    const p = createAudioPlayer({ uri: file.uri }, { updateInterval: 100 });
    player.current = p;
    p.play();
  }, [phases, release]);

  const pause = useCallback(() => {
    player.current?.pause();
    setStatus((s) => (s === 'running' ? 'paused' : s));
  }, []);

  const resume = useCallback(() => {
    player.current?.play();
    setStatus((s) => (s === 'paused' ? 'running' : s));
  }, []);

  const reset = useCallback(() => {
    release();
    setElapsed(0);
    setStatus('idle');
  }, [release]);

  // Fase actual a partir del tiempo de la pista.
  let index = 0;
  while (index < phases.length - 1 && elapsed >= starts[index] + phases[index].durationSec) index++;
  const remainingSec =
    status === 'idle'
      ? (phases[0]?.durationSec ?? 0)
      : status === 'done'
        ? 0
        : Math.max(0, starts[index] + (phases[index]?.durationSec ?? 0) - elapsed);

  return { index, status, remainingSec, start, pause, resume, reset, total };
}
