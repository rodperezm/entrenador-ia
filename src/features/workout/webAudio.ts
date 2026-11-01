// Sonido en el navegador. Web Audio arranca sin demora, a diferencia de un archivo suelto.

let context: AudioContext | null = null;

export function audioContext() {
  if (!context) {
    // Safari 16.4 en adelante: que suene aunque el iPhone esté en modo silencio.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    context = new AudioContext();
  }
  return context;
}

// Reactiva el audio. En iPhone suele quedar detenido al salir y volver; ese estado
// «interrupted» a veces solo sale suspendiendo primero. Nada aquí detiene el reloj.
export function wakeAudio() {
  const ctx = audioContext();
  if (ctx.state === 'running') return;
  const interrupted = (ctx.state as string) === 'interrupted';
  (interrupted ? ctx.suspend().catch(() => {}) : Promise.resolve())
    .then(() => ctx.resume())
    .catch(() => {});
}
