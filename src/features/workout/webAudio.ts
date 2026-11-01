// Sonido en el navegador. Web Audio arranca sin demora, a diferencia de un archivo suelto.

// Safari 16.4 en adelante: que suene aunque el iPhone esté en modo silencio.
function playEvenInSilentMode() {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
}

// Debe crearse dentro de un toque: Safari no deja partir el sonido sin uno.
export function createAudioContext() {
  playEvenInSilentMode();
  return new AudioContext();
}

let shared: AudioContext | null = null;
export const sharedAudioContext = () => (shared ??= createAudioContext());
