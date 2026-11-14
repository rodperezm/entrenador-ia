import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// En el teléfono, renovar la sesión solo mientras la app está en primer plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

// Marca de respaldo activo: se guarda solo después de entrar con el correo (ver state/sync).
export const CLOUD_CONSENT_KEY = 'cloud-consent.v1';

export class SessionLostError extends Error {
  constructor() {
    super('Tu sesión se cerró en este teléfono. Vuelve a entrar con tu correo.');
  }
}

// Con respaldo activo la persona ya entró con su correo: si ahora no hay sesión, o es anónima,
// la sesión se perdió (por ejemplo, venció). Hay que volver a entrar, no seguir con otra cuenta.
export async function sessionLost() {
  if (!(await AsyncStorage.getItem(CLOUD_CONSENT_KEY))) return false;
  const { data } = await supabase.auth.getSession();
  return !data.session || !!data.session.user.is_anonymous;
}

// Sesión anónima: identifica este teléfono ante Supabase sin pedir correo.
// Requiere activar "Allow anonymous sign-ins" en Authentication.
// Nunca se crea si la persona ya había entrado con su correo: sus datos irían a otra cuenta.
export async function ensureSession() {
  if (await sessionLost()) throw new SessionLostError();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signed.session;
}
