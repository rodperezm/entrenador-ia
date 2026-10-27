/// <reference types="node" />
// Genera los pitidos del entrenamiento como WAV (mismas frecuencias que el
// temporizador Tabata). Uso: npx tsx scripts/make-sounds.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SR = 22050;

function addTone(buf: Float32Array, at: number, freq: number, dur: number, vol: number, tri = false) {
  const s0 = Math.round(at * SR);
  const n = Math.round(dur * SR);
  const k = Math.pow(0.0001 / vol, 1 / n); // caída exponencial
  let env = vol;
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const ph = (2 * Math.PI * freq * i) / SR;
    const x = tri ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph);
    buf[s0 + i] += x * env * (i < 64 ? i / 64 : 1);
    env *= k;
  }
}

function wav(buf: Float32Array): Buffer {
  const out = Buffer.alloc(44 + buf.length * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + buf.length * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(buf.length * 2, 40);
  buf.forEach((v, i) => out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 30000))), 44 + i * 2));
  return out;
}

const sounds: Record<string, (b: Float32Array) => void> = {
  work: (b) => addTone(b, 0, 880, 0.5, 0.5),
  rest: (b) => addTone(b, 0, 500, 0.4, 0.4),
  count: (b) => addTone(b, 0, 700, 0.12, 0.45),
  tick: (b) => addTone(b, 0, 1500, 0.07, 0.6, true),
  tock: (b) => addTone(b, 0, 950, 0.09, 0.6, true),
  done: (b) => {
    addTone(b, 0, 660, 0.2, 0.5);
    addTone(b, 0.22, 880, 0.2, 0.5);
    addTone(b, 0.44, 1100, 0.5, 0.5);
  },
};
const LENGTH: Record<string, number> = { work: 0.55, rest: 0.45, count: 0.15, tick: 0.1, tock: 0.12, done: 1 };

const dir = join(__dirname, '..', 'assets', 'sounds');
mkdirSync(dir, { recursive: true });
for (const [name, draw] of Object.entries(sounds)) {
  const buf = new Float32Array(Math.ceil(LENGTH[name] * SR));
  draw(buf);
  writeFileSync(join(dir, `${name}.wav`), wav(buf));
}
console.log(`OK: ${Object.keys(sounds).length} sonidos en assets/sounds`);
