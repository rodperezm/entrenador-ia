import { Platform } from 'react-native';

// Identificador corto de la versión publicada, para saber cuál tiene abierta un teléfono (la web
// puede quedar guardada con una versión anterior). En la web sale del nombre del archivo de la app,
// que cambia en cada publicación; no hay que mantenerlo a mano.
export function buildId(): string | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const src = [...document.querySelectorAll('script[src]')]
    .map((s) => s.getAttribute('src') ?? '')
    .find((s) => /entry-[a-f0-9]+\.js/.test(s));
  return src ? src.match(/entry-([a-f0-9]{6})/)![1] : null;
}
