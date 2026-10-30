import { Link, router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardDoneBar } from '@/components/KeyboardDoneBar';
import { Button, CheckRow } from '@/components/ui';
import { requestBackupCode, requestLoginCode, verifyBackupCode, verifyLoginCode } from '@/lib/cloudSync';
import { ensureSession } from '@/lib/supabase';
import { useSync } from '@/state/sync';
import { colors, radius, spacing } from '@/theme';

type Mode = 'new' | 'existing';

const CODE_LENGTH = 6;

const friendlyError = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  if (code === 'email_exists') return 'Ese correo ya tiene una cuenta. Elige «Ya tengo cuenta».';
  if (code === 'otp_expired') return 'El código no es válido o ya venció. Pide uno nuevo.';
  if (code === 'over_email_send_rate_limit') return 'Se enviaron muchos correos. Espera un rato e inténtalo de nuevo.';
  if (code === 'otp_disabled' || code === 'user_not_found') return 'No encontramos una cuenta con ese correo.';
  return 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.';
};

function confirmAction(title: string, message: string, label: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: label, style: 'destructive', onPress: onConfirm },
  ]);
}

export default function AccountScreen() {
  const { enabled } = useSync();
  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Cuenta y respaldo' }} />
        {enabled ? <BackupActive /> : <BackupSetup />}
        <Link href="/privacy" style={styles.link}>
          Cómo cuidamos tus datos
        </Link>
      </ScrollView>
      <KeyboardDoneBar />
    </>
  );
}

function BackupSetup() {
  const { enable } = useSync();
  const [mode, setMode] = useState<Mode>('new');
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();
  const emailOk = /^\S+@\S+\.\S+$/.test(cleanEmail);

  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setWorking(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      await ensureSession();
      await (mode === 'new' ? requestBackupCode(cleanEmail) : requestLoginCode(cleanEmail));
      setCodeSent(true);
    });

  const confirmCode = () =>
    run(async () => {
      await (mode === 'new' ? verifyBackupCode(cleanEmail, code) : verifyLoginCode(cleanEmail, code));
      await enable();
      router.replace('/');
    });

  return (
    <>
      <Text style={styles.title}>Protege tu historial</Text>
      <Text style={styles.body}>
        Hoy tus datos están solo en este teléfono. Con un respaldo los recuperas si cambias de teléfono o borras la
        app.
      </Text>

      {!codeSent ? (
        <>
          <View style={styles.segment}>
            <Button label="Crear respaldo" variant={mode === 'new' ? 'primary' : 'ghost'} onPress={() => setMode('new')} />
            <Button
              label="Ya tengo cuenta"
              variant={mode === 'existing' ? 'primary' : 'ghost'}
              onPress={() => setMode('existing')}
            />
          </View>

          <Text style={styles.label}>Tu correo</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={styles.input}
          />

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Antes de activar</Text>
            <Text style={styles.body}>
              Guardaremos en la nube tu perfil, lesiones, dolor, entrenamientos y medidas corporales. Son datos de
              salud: solo tú puedes verlos desde tu cuenta, y puedes descargarlos o borrarlos cuando quieras.
            </Text>
            <Link href="/privacy" style={styles.link}>
              Leer cómo cuidamos tus datos
            </Link>
            <CheckRow
              label="Acepto guardar mis datos, incluidos los de salud, en la nube."
              checked={consent}
              onPress={() => setConsent(!consent)}
            />
          </View>

          <Button
            label={working ? 'Enviando…' : 'Enviarme un código'}
            onPress={sendCode}
            disabled={!consent || !emailOk || working}
          />
        </>
      ) : (
        <>
          <Text style={styles.body}>Te enviamos un código de {CODE_LENGTH} dígitos a {cleanEmail}.</Text>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
            placeholder="123456"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            style={[styles.input, styles.code]}
          />
          <Button
            label={working ? 'Revisando…' : 'Confirmar código'}
            onPress={confirmCode}
            disabled={code.length !== CODE_LENGTH || working}
          />
          <Button label="Cambiar correo" variant="ghost" onPress={() => setCodeSent(false)} />
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </>
  );
}

function BackupActive() {
  const { status, email, lastSyncAt, syncNow, signOut, removeAccount, exportData } = useSync();
  const [error, setError] = useState<string | null>(null);

  const statusText = {
    off: 'Respaldo apagado',
    syncing: 'Sincronizando…',
    ok: lastSyncAt ? `Al día · ${new Date(lastSyncAt).toLocaleString('es-CL')}` : 'Al día',
    pending: 'Pendiente: se sube apenas haya conexión.',
  }[status];

  const download = async () => {
    const json = exportData();
    if (Platform.OS === 'web') {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      link.download = 'mis-datos-kettleia.json';
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }
    await Share.share({ title: 'Mis datos de KettleIA', message: json });
  };

  const askSignOut = () =>
    confirmAction(
      '¿Cerrar sesión en este teléfono?',
      'Dejará de sincronizar. Tu respaldo y lo guardado en este teléfono se mantienen.',
      'Cerrar sesión',
      signOut,
    );

  const askDelete = () =>
    confirmAction(
      '¿Borrar tu cuenta y tu respaldo?',
      'Se borra todo lo guardado en la nube y no se puede recuperar. Lo que está en este teléfono se mantiene.',
      'Borrar',
      () => removeAccount().catch(() => setError('No se pudo borrar. Revisa tu conexión e inténtalo de nuevo.')),
    );

  return (
    <>
      <Text style={styles.title}>Respaldo activo</Text>
      {email && <Text style={styles.body}>{email}</Text>}
      <Text style={styles.body}>{statusText}</Text>
      <Button label="Sincronizar ahora" variant="ghost" onPress={syncNow} disabled={status === 'syncing'} />
      <Text style={styles.label}>Tus datos</Text>
      <Button label="Descargar mis datos" variant="ghost" onPress={download} />
      <Button label="Cerrar sesión en este teléfono" variant="ghost" onPress={askSignOut} />
      <Button label="Borrar mi cuenta y mi respaldo" variant="ghost" onPress={askDelete} />
      {error && <Text style={styles.error}>{error}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
  label: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: spacing.sm },
  segment: { gap: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  code: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  notice: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  noticeTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  link: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  error: { color: colors.warning, fontSize: 14, lineHeight: 20 },
});
