import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { ensureSession, supabase } from './supabase';

// Reportes al equipo: errores que ocurren en la app y comentarios que la persona escribe.
// Van a la tabla «app_reports» (migración 0006) y se leen en el panel.
//
// No llevan datos de salud: solo el mensaje, la pantalla, la versión y el tipo de equipo.
// Reportar nunca debe romper la app: cualquier falla aquí se ignora.

export type ReportKind = 'error' | 'feedback';

const MAX_MESSAGE = 3500;
const MAX_STACK = 1500;
// Un error que se repite se envía una sola vez por apertura, y con un tope: un ciclo de fallas
// no debe convertirse en cientos de envíos.
const MAX_ERRORS_PER_OPEN = 5;
const sent = new Set<string>();

const where = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Solo la ruta: lo que va después de «?» puede traer datos de la persona.
    return window.location.pathname;
  }
  return null;
};

const context = (extra: Record<string, unknown> = {}) => ({
  version: Constants.expoConfig?.version ?? null,
  platform: Platform.OS,
  screen: where(),
  agent: Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
  ...extra,
});

/** Envía un reporte. Responde si quedó guardado; nunca lanza un error. */
export async function sendReport(kind: ReportKind, message: string, extra?: Record<string, unknown>) {
  try {
    const text = message.trim().slice(0, MAX_MESSAGE);
    if (!text) return false;
    await ensureSession();
    const { data, error } = await supabase.rpc('send_report', {
      report_kind: kind,
      report_message: text,
      report_context: context(extra),
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Reporta un error de la app, una vez por cada error distinto. */
export function reportError(error: unknown, source: string) {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Error desconocido');
  const key = `${source}:${e.message}`;
  if (sent.has(key) || sent.size >= MAX_ERRORS_PER_OPEN) return;
  sent.add(key);
  void sendReport('error', e.message || 'Error sin mensaje', {
    source,
    stack: (e.stack ?? '').slice(0, MAX_STACK),
  });
}

let listening = false;
/** En la web, también se reportan los errores que no llegan a una pantalla (promesas, eventos). */
export function listenForErrors() {
  if (listening || Platform.OS !== 'web' || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('error', (event) => reportError(event.error ?? event.message, 'window'));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason, 'promise'));
}
