import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Phase } from '@/domain/session';
import { buildTabataWav, phaseStarts, TRACK_SAMPLE_RATE, trackPosition, WAV_HEADER_BYTES } from './tabataTrack';
import type { RunnerStatus } from './useRunner';
import { createAudioContext } from './webAudio';

type Track = { ctx: AudioContext; source: AudioBufferSourceNode; startAt: number };

// Igual que en el teléfono: una sola pista marca el tiempo, así que lo que se ve
// y lo que suena coinciden. El reloj es el del audio, no uno aparte.
export function useTrackRunner(phases: Phase[]) {
  const { starts, total } = useMemo(() => phaseStarts(phases), [phases]);
  const [status, setStatus] = useState<RunnerStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const track = useRef<Track | null>(null);

  const release = useCallback(() => {
    const current = track.current;
    track.current = null;
    if (!current) return;
    try {
      current.source.stop();
    } catch {}
    current.ctx.close().catch(() => {});
  }, []);

  useEffect(() => release, [release]);

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => {
      const current = track.current;
      if (!current) return;
      const { ctx, startAt } = current;
      // Una llamada o salir del navegador corta el audio: queda en pausa para retomarlo.
      if ((ctx.state as string) === 'interrupted') {
        setStatus('paused');
        return;
      }
      const t = Math.max(0, ctx.currentTime - startAt - (ctx.outputLatency || 0));
      setElapsed(t);
      if (t >= total) setStatus('done');
    }, 50);
    return () => clearInterval(id);
  }, [status, total]);

  // Sin esperas antes de partir: todo debe ocurrir dentro del toque en Empezar.
  const start = useCallback(() => {
    release();
    const ctx = createAudioContext();
    ctx.resume().catch(() => {});
    const samples = new Int16Array(buildTabataWav(phases).buffer, WAV_HEADER_BYTES);
    const buffer = ctx.createBuffer(1, samples.length, TRACK_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    samples.forEach((s, i) => {
      channel[i] = s / 32768;
    });
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = ctx.currentTime + 0.05;
    source.start(startAt);
    track.current = { ctx, source, startAt };
    setElapsed(0);
    setStatus('running');
  }, [phases, release]);

  const pause = useCallback(() => {
    track.current?.ctx.suspend().catch(() => {});
    setStatus((s) => (s === 'running' ? 'paused' : s));
  }, []);

  const resume = useCallback(() => {
    track.current?.ctx.resume().catch(() => {});
    setStatus((s) => (s === 'paused' ? 'running' : s));
  }, []);

  const reset = useCallback(() => {
    release();
    setElapsed(0);
    setStatus('idle');
  }, [release]);

  return { ...trackPosition(phases, starts, status, elapsed), status, start, pause, resume, reset, total };
}
