import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Anota hasta qué paso del registro llega este teléfono, para saber dónde abandona la gente
// (migración 0009). Es anónimo: un identificador al azar creado aquí, el paso y la fecha.
// No lleva correo, cuenta ni datos de salud, y funciona antes de crear la cuenta.
// Medir nunca debe estorbar: cualquier falla se ignora.

export type OnboardingStep =
  | 'intro'
  | 'account_form'
  | 'code_requested'
  | 'account_created'
  | 'existing_account'
  | 'step_welcome'
  | 'step_about'
  | 'step_equipment'
  | 'step_conditions'
  | 'step_week'
  | 'done';

const DEVICE_KEY = 'device-id.v1';
const SENT_KEY = 'onboarding-sent.v1';

const randomId = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Teléfonos sin randomUUID: mismo formato, armado a mano.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

let devicePromise: Promise<string> | null = null;
const deviceId = () =>
  (devicePromise ??= AsyncStorage.getItem(DEVICE_KEY).then(async (saved) => {
    if (saved) return saved;
    const id = randomId();
    await AsyncStorage.setItem(DEVICE_KEY, id).catch(() => {});
    return id;
  }));

// Cada paso se envía una sola vez por teléfono.
const sent = new Set<string>();
let loaded: Promise<void> | null = null;
const loadSent = () =>
  (loaded ??= AsyncStorage.getItem(SENT_KEY)
    .then((raw) => {
      (raw ? (JSON.parse(raw) as string[]) : []).forEach((s) => sent.add(s));
    })
    .catch(() => {}));

export function trackOnboarding(step: OnboardingStep) {
  void (async () => {
    try {
      await loadSent();
      if (sent.has(step)) return;
      sent.add(step);
      const { error } = await supabase.rpc('track_onboarding', { device: await deviceId(), step_name: step });
      if (error) {
        sent.delete(step);
        return;
      }
      await AsyncStorage.setItem(SENT_KEY, JSON.stringify([...sent])).catch(() => {});
    } catch {
      sent.delete(step);
    }
  })();
}
