// Sonido en el navegador. Web Audio arranca sin demora, a diferencia de un archivo suelto.

type WebAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;

// Sin audio disponible responde null: el entrenamiento sigue, solo que sin sonido.
export function audioContext() {
  if (context) return context;
  try {
    const Context = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
    if (!Context) return null;
    // Safari 16.4 en adelante: que suene aunque el iPhone esté en modo silencio.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    context = new Context();
  } catch {
    return null;
  }
  return context;
}

// Reactiva el audio. En iPhone suele quedar detenido al salir y volver; ese estado
// «interrupted» a veces solo sale suspendiendo primero. Nada aquí detiene el reloj.
export function wakeAudio() {
  const ctx = audioContext();
  if (!ctx || ctx.state === 'running') return;
  const interrupted = (ctx.state as string) === 'interrupted';
  (interrupted ? ctx.suspend().catch(() => {}) : Promise.resolve())
    .then(() => ctx.resume())
    .catch(() => {});
}
