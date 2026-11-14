import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Identificador corto de la versión publicada, para saber cuál tiene abierta un teléfono (la web
// puede quedar guardada con una versión anterior). En la web sale del nombre del archivo de la app,
// que cambia en cada publicación; no hay que mantenerlo a mano.
/** Número de versión con nombre (el de app.json). Su historia está en VERSIONES.md. */
export const appVersion = (): string | null => Constants.expoConfig?.version ?? null;

/**
 * Medidas de pantalla que entrega el teléfono, para diagnosticar cortes en la app instalada.
 * Solo se muestran en el ambiente de pruebas. Orden: pantalla · ventana · documento · marco de la
 * app (arriba-abajo) · margen superior e inferior · instalada (1) o no (0).
 */
export function screenDiagnostics(): string | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const root = document.getElementById('root')?.getBoundingClientRect();
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = `${parseFloat(cs.paddingTop) || 0}/${parseFloat(cs.paddingBottom) || 0}`;
  probe.remove();
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return [
    `${screen.width}x${screen.height}`,
    `${window.innerWidth}x${window.innerHeight}`,
    `${document.documentElement.clientHeight}`,
    root ? `${Math.round(root.top)}-${Math.round(root.bottom)}` : '?',
    insets,
    nav.standalone ? '1' : '0',
    window.visualViewport ? `${Math.round(window.visualViewport.height)}` : '?',
    `${document.documentElement.scrollHeight}/${Math.round(window.scrollY)}`,
  ].join(' · ');
}

export function buildId(): string | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const src = [...document.querySelectorAll('script[src]')]
    .map((s) => s.getAttribute('src') ?? '')
    .find((s) => /entry-[a-f0-9]+\.js/.test(s));
  return src ? src.match(/entry-([a-f0-9]{6})/)![1] : null;
}
