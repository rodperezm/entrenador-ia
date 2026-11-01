import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardDoneBar } from '@/components/KeyboardDoneBar';
import { Button, CheckRow } from '@/components/ui';
import { requestBackupCode, requestLoginCode, verifyBackupCode, verifyLoginCode } from '@/lib/cloudSync';
import { ensureSession } from '@/lib/supabase';
import { useSync } from '@/state/sync';
import { colors, radius, spacing } from '@/theme';

type Mode = 'new' | 'existing';

const CODE_LENGTH = 8; // Debe coincidir con «Longitud del OTP» en Supabase.

const errorCode = (e: unknown) => (e as { code?: string })?.code;

const friendlyError = (e: unknown) => {
  const code = errorCode(e);
  if (code === 'email_exists') return 'Ese correo ya tiene una cuenta. Pedimos el código desde aquí para recuperarla.';
  if (code === 'otp_expired') return 'El código no es válido o ya venció. Pide uno nuevo.';
  if (code === 'over_email_send_rate_limit') return 'Se enviaron muchos correos. Espera un rato e inténtalo de nuevo.';
  if (code === 'otp_disabled' || code === 'user_not_found') {
    return 'No encontramos una cuenta con ese correo. Si es tu primera vez, elige «Crear respaldo».';
  }
  return 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.';
};

const COPY: Record<Mode, { title: string; intro: string; noticeTitle: string; notice: string; consent: string }> = {
  new: {
    title: 'Protege tu historial',
    intro: 'Hoy tus datos están solo en este teléfono. Con un respaldo los recuperas si cambias de teléfono o borras la app.',
    noticeTitle: 'Antes de activar',
    notice:
      'Guardaremos en la nube tu perfil, lesiones, dolor, entrenamientos y medidas corporales. Son datos de salud: solo tú puedes verlos desde tu cuenta, y puedes descargarlos o borrarlos cuando quieras.',
    consent: 'Acepto guardar mis datos, incluidos los de salud, en la nube.',
  },
  existing: {
    title: 'Recupera tus datos',
    intro: 'Escribe el correo de tu respaldo. Te enviaremos un código para entrar, sin contraseña.',
    noticeTitle: 'Al entrar',
    notice:
      'Tus entrenamientos y medidas se suman a los de este teléfono. Tu perfil, tu semana y tu rutina se reemplazan por los del respaldo.',
    consent: 'Acepto sincronizar este teléfono con mi respaldo, incluidos mis datos de salud.',
  },
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
      </ScrollView>
      <KeyboardDoneBar />
    </>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const options: { value: Mode; label: string }[] = [
    { value: 'new', label: 'Crear respaldo' },
    { value: 'existing', label: 'Ya tengo cuenta' },
  ];
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === mode;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            aria-selected={selected}
            style={[styles.segmentOption, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BackupSetup() {
  const { enable } = useSync();
  const { mode: initialMode } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(initialMode === 'existing' ? 'existing' : 'new');
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resent, setResent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un código sirve una sola vez: si falla lo que sigue, reintentar no debe volver a validarlo.
  const verified = useRef(false);

  const cleanEmail = email.trim().toLowerCase();
  const emailOk = /^\S+@\S+\.\S+$/.test(cleanEmail);
  const copy = COPY[mode];

  const changeMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setConsent(false);
    setError(null);
  };

  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (errorCode(e) === 'email_exists') changeMode('existing');
      setError(friendlyError(e));
    } finally {
      setWorking(false);
    }
  };

  const requestCode = async () => {
    await ensureSession();
    await (mode === 'new' ? requestBackupCode(cleanEmail) : requestLoginCode(cleanEmail));
  };

  const sendCode = () =>
    run(async () => {
      await requestCode();
      setCodeSent(true);
    });

  const resendCode = () =>
    run(async () => {
      setResent(false);
      await requestCode();
      setCode('');
      setResent(true);
    });

  const confirmCode = () =>
    run(async () => {
      if (!verified.current) {
        await (mode === 'new' ? verifyBackupCode(cleanEmail, code) : verifyLoginCode(cleanEmail, code));
        verified.current = true;
      }
      await enable();
      router.replace('/');
    });

  return (
    <>
      <Text style={styles.title}>{copy.title}</Text>
      {!codeSent && <Text style={styles.body}>{copy.intro}</Text>}

      {!codeSent ? (
        <>
          <ModeSwitch mode={mode} onChange={changeMode} />

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
            <Text style={styles.noticeTitle}>{copy.noticeTitle}</Text>
            <Text style={styles.body}>{copy.notice}</Text>
            <Link href="/privacy" style={styles.link}>
              Leer cómo cuidamos tus datos
            </Link>
            <CheckRow label={copy.consent} checked={consent} onPress={() => setConsent(!consent)} />
          </View>

          <Button
            label={working ? 'Enviando…' : 'Enviarme un código'}
            onPress={sendCode}
            disabled={!consent || !emailOk || working}
          />
        </>
      ) : (
        <>
          <Text style={styles.body}>
            {resent ? 'Te enviamos un código nuevo' : 'Te enviamos un código'} de {CODE_LENGTH} dígitos a {cleanEmail}.
            Si no llega, revisa la carpeta de spam.
          </Text>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
            placeholder="12345678"
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
          <Button label="Reenviar código" variant="secondary" onPress={resendCode} disabled={working} />
          <Button
            label="Cambiar correo"
            variant="ghost"
            onPress={() => {
              setCodeSent(false);
              setResent(false);
              setCode('');
              setError(null);
            }}
          />
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={22} color={danger ? colors.accent : colors.text} />
      <Text style={[styles.rowLabel, danger && { color: colors.accent }]}>{label}</Text>
      {!danger && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

function BackupActive() {
  const { status, email, lastSyncAt, syncNow, signOut, removeAccount, exportData } = useSync();
  const [error, setError] = useState<string | null>(null);

  const pending = status === 'pending';
  const statusText = {
    off: 'Respaldo apagado',
    syncing: 'Sincronizando…',
    ok: 'Todo al día',
    pending: 'Pendiente: se sube apenas haya conexión.',
  }[status];
  const lastCopy = lastSyncAt
    ? new Date(lastSyncAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const download = async () => {
    const json = exportData();
    if (Platform.OS === 'web') {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      link.download = 'mis-datos-kettai.json';
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }
    await Share.share({ title: 'Mis datos de KETTAI', message: json });
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
      <View style={styles.statusCard}>
        <View style={[styles.statusIcon, pending && { backgroundColor: colors.warningSoft }]}>
          <Ionicons
            name={pending ? 'cloud-upload-outline' : 'shield-checkmark'}
            size={30}
            color={pending ? colors.warning : colors.accent}
          />
        </View>
        <Text style={styles.statusTitle}>Respaldo activo</Text>
        {email && <Text style={styles.body}>{email}</Text>}
        <View style={styles.divider} />
        <Text style={[styles.statusText, pending && { color: colors.warning }]}>{statusText}</Text>
        {lastCopy && <Text style={styles.small}>Última copia: {lastCopy}</Text>}
      </View>
      <Button
        label={status === 'syncing' ? 'Sincronizando…' : 'Sincronizar ahora'}
        onPress={syncNow}
        disabled={status === 'syncing'}
      />

      <Text style={styles.section}>Tus datos</Text>
      <View style={styles.group}>
        <ActionRow icon="download-outline" label="Descargar mis datos" onPress={download} />
        <View style={styles.rowDivider} />
        <ActionRow icon="lock-closed-outline" label="Cómo cuidamos tus datos" onPress={() => router.push('/privacy')} />
      </View>

      <Text style={styles.section}>Tu cuenta</Text>
      <View style={styles.group}>
        <ActionRow icon="log-out-outline" label="Cerrar sesión en este teléfono" onPress={askSignOut} />
        <View style={styles.rowDivider} />
        <ActionRow icon="trash-outline" label="Borrar mi cuenta y mi respaldo" onPress={askDelete} danger />
      </View>
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
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  segmentOption: { flex: 1, paddingVertical: 12, borderRadius: radius.pill, alignItems: 'center' },
  segmentSelected: { backgroundColor: colors.accent },
  segmentText: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
  segmentTextSelected: { color: colors.onAccent },
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
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statusTitle: { color: colors.text, fontSize: 24, fontWeight: '800' },
  statusText: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  small: { color: colors.textMuted, fontSize: 13 },
  divider: { alignSelf: 'stretch', height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  section: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: spacing.md },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  rowLabel: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 },
  rowDivider: { height: 1, backgroundColor: colors.border, marginLeft: 50 },
});
