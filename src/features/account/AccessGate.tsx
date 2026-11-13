import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui';
import { CLOUD_BACKUP_READY } from '@/lib/cloudSync';
import { supabase } from '@/lib/supabase';
import { useSync } from '@/state/sync';
import { colors, display, spacing } from '@/theme';
import { type AccountStatus, decideAccess } from './accessRules';

// Puerta de entrada a la app durante la etapa de prueba: hay que tener cuenta con correo y que el
// administrador la apruebe (migración 0010). El bloqueo real está en la base de datos; esto solo
// muestra la pantalla que corresponde. Si no se puede consultar (sin conexión), vale la última
// respuesta conocida, y si nunca hubo una, se deja pasar: sin conexión la app igual no sube nada.

const CACHE_KEY = 'account-status.v1';
type Status = AccountStatus;

export function AccessGate({ children }: { children: ReactNode }) {
  const { ready, enabled, email } = useSync();
  const [status, setStatus] = useState<Status | null>(null);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.rpc('account_status');
      if (error || !data) throw new Error();
      setStatus(data as Status);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => {});
    } catch {
      const raw = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
      if (raw) setStatus(JSON.parse(raw) as Status);
    } finally {
      setChecked(true);
      setChecking(false);
    }
  }, []);

  // Al abrir, al volver a la app y cuando cambia la cuenta (por ejemplo, recién creada).
  useEffect(() => {
    if (!CLOUD_BACKUP_READY || !ready) return;
    const first = setTimeout(() => void check(), 0);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, [ready, enabled, email, check]);

  if (!CLOUD_BACKUP_READY) return children;
  if (!ready || !checked) return <LoadingScreen />;

  const access = decideAccess(status, enabled);
  if (access === 'open') return children;

  if (access === 'needs_account') {
    return (
      <View style={styles.screen} testID="gate-account">
        <Text style={styles.title}>{enabled ? 'Vuelve a entrar' : 'Crea tu cuenta'}</Text>
        <Text style={styles.body}>
          {enabled
            ? 'Tu sesión se cerró en este teléfono. Entra de nuevo con tu correo para seguir.'
            : 'Para usar KETTAI necesitas una cuenta con tu correo. Es gratis, sin contraseña, y lo que ya registraste en este teléfono se conserva.'}
        </Text>
        <Button label={enabled ? 'Entrar con mi correo' : 'Crear mi cuenta'} onPress={() => router.push('/account')} />
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="gate-waiting">
      <Text style={styles.title}>Tu cuenta espera aprobación</Text>
      <Text style={styles.body}>
        KETTAI está en etapa de prueba y las cuentas se aprueban una a una. Ya recibimos la tuya{email ? ` (${email})` : ''}:
        apenas la aprobemos, podrás entrar.
      </Text>
      <Text style={styles.body}>Lo que registraste en este teléfono se conserva.</Text>
      <Button label={checking ? 'Revisando…' : 'Revisar de nuevo'} onPress={check} disabled={checking} />
      <Button label="Cuenta y respaldo" variant="ghost" onPress={() => router.push('/account')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md, justifyContent: 'center' },
  title: { ...display(30), color: colors.text },
  body: { color: colors.textMuted, fontSize: 16, lineHeight: 23 },
});
