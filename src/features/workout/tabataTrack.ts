import type { Phase } from '@/domain/session';

// Pista de audio completa del entrenamiento, portada de buildTrack() del
// temporizador Tabata original: todos los pitidos y el tic-tac ya ubicados en
// su segundo exacto. El reloj de la pantalla lee la posición de esta pista,
// así sonido y números nunca se desfasan.

const SR = 8000; // 8 kHz, como el original
export const MAX_TRACK_SEC = 2400; // hasta 40 minutos; más largo usa el modo en vivo

function addTone(buf: Int16Array, at: number, freq: number, dur: number, vol: number, tri = false) {
  const s0 = Math.round(at * SR);
  const n = Math.round(dur * SR);
  const k = Math.pow(0.0001 / vol, 1 / n);
  let env = vol;
  for (let i = 0; i < n; i++) {
    const j = s0 + i;
    if (j < 0 || j >= buf.length) break;
    const ph = (2 * Math.PI * freq * i) / SR;
    const x = tri ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph);
    const y = buf[j] + x * env * (i < 16 ? i / 16 : 1) * 30000;
    buf[j] = y > 32767 ? 32767 : y < -32768 ? -32768 : y;
    env *= k;
  }
}

export function phaseStarts(phases: Phase[]) {
  const starts: number[] = [];
  let t = 0;
  for (const p of phases) {
    starts.push(t);
    t += p.durationSec;
  }
  return { starts, total: t };
}

// Devuelve el archivo WAV completo (cabecera + muestras de 16 bits) en un solo búfer.
export function buildTabataWav(phases: Phase[]): Uint8Array {
  const { starts, total } = phaseStarts(phases);
  const samples = Math.ceil((total + 2) * SR);
  const bytes = new Uint8Array(44 + samples * 2);
  const v = new DataView(bytes.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples * 2, true);
  const buf = new Int16Array(bytes.buffer, 44, samples);

  let c = 0;
  phases.forEach((ph, i) => {
    const s = starts[i];
    if (ph.kind === 'work') addTone(buf, s, 880, 0.5, 0.5);
    else if (ph.kind !== 'prep') addTone(buf, s, 500, 0.4, 0.4);
    if (ph.kind === 'work' && ph.round === 1 && ph.exercise === 1) addTone(buf, s + 0.45, 1175, 0.35, 0.5); // "¡Vamos!"
    for (let k = 1; k < ph.durationSec; k++) {
      if (ph.durationSec - k <= 3) {
        addTone(buf, s + k, 700, 0.12, 0.45); // últimos 3 segundos
      } else {
        c++;
        if (c % 2) addTone(buf, s + k, 1500, 0.07, 0.6, true);
        else addTone(buf, s + k, 950, 0.09, 0.6, true);
      }
    }
  });
  // ¡Lo lograste!
  addTone(buf, total, 660, 0.2, 0.5);
  addTone(buf, total + 0.22, 880, 0.2, 0.5);
  addTone(buf, total + 0.44, 1100, 0.5, 0.5);
  return bytes;
}
