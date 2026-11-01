import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Phase } from '@/domain/session';
import { buildTabataWav, phaseStarts, TRACK_SAMPLE_RATE, trackPosition, WAV_HEADER_BYTES } from './tabataTrack';
import type { RunnerStatus } from './useRunner';
import { audioContext, wakeAudio } from './webAudio';

const TICK_MS = 100;
const MAX_DRIFT_SEC = 0.5;

function trackBuffer(ctx: AudioContext, phases: Phase[]) {
  const samples = new Int16Array(buildTabataWav(phases).buffer, WAV_HEADER_BYTES);
  const buffer = ctx.createBuffer(1, samples.length, TRACK_SAMPLE_RATE);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
  return buffer;
}

// El tiempo lo marca el reloj del navegador, nunca el audio: en iPhone el audio puede
// detenerse sin aviso. La pista sigue a ese reloj y se recoloca si se separa de él.
export function useTrackRunner(phases: Phase[]) {
  const { starts, total } = useMemo(() => phaseStarts(phases), [phases]);
  const [status, setStatus] = useState<RunnerStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const clock = useRef({ startedAt: 0, pausedAt: 0 });
  const audio = useRef<{ source: AudioBufferSourceNode; anchor: number } | null>(null);
  const buffer = useRef<AudioBuffer | null>(null);

  const stopAudio = useCallback(() => {
    try {
      audio.current?.source.stop();
    } catch {}
    audio.current = null;
  }, []);

  const playFrom = useCallback(
    (offset: number) => {
      if (!buffer.current || offset >= buffer.current.duration) return;
      stopAudio();
      const ctx = audioContext();
      const source = ctx.createBufferSource();
      source.buffer = buffer.current;
      source.connect(ctx.destination);
      source.start(0, offset);
      audio.current = { source, anchor: ctx.currentTime - offset };
    },
    [stopAudio],
  );

  useEffect(() => stopAudio, [stopAudio]);

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => {
      const t = (performance.now() - clock.current.startedAt) / 1000;
      setElapsed(t);
      if (t >= total) {
        setStatus('done');
        return;
      }
      const ctx = audioContext();
      if (ctx.state !== 'running') wakeAudio();
      else if (!audio.current || Math.abs(ctx.currentTime - audio.current.anchor - t) > MAX_DRIFT_SEC) playFrom(t);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [status, total, playFrom]);

  // Dentro del toque en Empezar: Safari no deja partir el sonido sin uno.
  const start = useCallback(() => {
    wakeAudio();
    buffer.current = trackBuffer(audioContext(), phases);
    clock.current.startedAt = performance.now();
    // Si el audio aún no despierta, la pista parte sola en cuanto esté listo.
    if (audioContext().state === 'running') playFrom(0);
    setElapsed(0);
    setStatus('running');
  }, [phases, playFrom]);

  const pause = useCallback(() => {
    clock.current.pausedAt = performance.now();
    stopAudio();
    setStatus((s) => (s === 'running' ? 'paused' : s));
  }, [stopAudio]);

  const resume = useCallback(() => {
    wakeAudio();
    const { startedAt, pausedAt } = clock.current;
    clock.current.startedAt = startedAt + performance.now() - pausedAt;
    playFrom((pausedAt - startedAt) / 1000);
    setStatus((s) => (s === 'paused' ? 'running' : s));
  }, [playFrom]);

  const reset = useCallback(() => {
    stopAudio();
    setElapsed(0);
    setStatus('idle');
  }, [stopAudio]);

  return { ...trackPosition(phases, starts, status, elapsed), status, start, pause, resume, reset, total };
}
