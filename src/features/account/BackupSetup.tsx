import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, CheckRow } from '@/components/ui';
import { requestBackupCode, requestLoginCode, verifyBackupCode, verifyLoginCode } from '@/lib/cloudSync';
import { trackOnboarding } from '@/lib/onboardingTrack';
import { ensureSession } from '@/lib/supabase';
import { useSync } from '@/state/sync';
import { colors, display, radius, spacing } from '@/theme';
import { cleanEmail as cleanEmailInput, isEmail } from './email';

// Correo con código, sin contraseña. Sirve para crear la cuenta (convierte la sesión
// anónima en una con correo) o para entrar a una que ya existe.

export type Mode = 'new' | 'existing';

const CODE_LENGTH = 8; // Debe coincidir con «Longitud del OTP» en Supabase.

const errorCode = (e: unknown) => (e as { code?: string })?.code;

const friendlyError = (e: unknown, signup: boolean) => {
  const code = errorCode(e);
  if (code === 'email_exists') return 'Ese correo ya tiene una cuenta. Pedimos el código desde aquí para recuperarla.';
  if (code === 'otp_expired') return 'El código no es válido o ya venció. Pide uno nuevo.';
  if (code === 'over_email_send_rate_limit') return 'Se enviaron muchos correos. Espera un rato e inténtalo de nuevo.';
  if (code === 'otp_disabled' || code === 'user_not_found') {
    return `No encontramos una cuenta con ese correo. Si es tu primera vez, elige «${signup ? 'Soy nuevo' : 'Crear respaldo'}».`;
  }
  return 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.';
};

type Copy = { title: string; intro: string; noticeTitle: string; notice: string; consent: string };

const EXISTING: Copy = {
  title: 'Recupera tus datos',
  intro: 'Escribe el correo de tu cuenta. Te enviaremos un código para entrar, sin contraseña.',
  noticeTitle: 'Al entrar',
  notice:
    'Tus entrenamientos y medidas se suman a los de este teléfono. Tu perfil, tu semana y tu rutina se reemplazan por los de tu cuenta. Si este teléfono guardaba datos de otra cuenta, se reemplazan todos por los de la tuya.',
  consent: 'Acepto sincronizar este teléfono con mi cuenta, incluidos mis datos de salud.',
};

const COPY: Record<'backup' | 'signup', Record<Mode, Copy>> = {
  backup: {
    new: {
      title: 'Protege tu historial',
      intro:
        'Hoy tus datos están solo en este teléfono. Con un respaldo los recuperas si cambias de teléfono o borras la app.',
      noticeTitle: 'Antes de activar',
      notice:
        'Guardaremos en la nube tu perfil, lesiones, dolor, entrenamientos y medidas corporales. Son datos de salud: solo tú puedes verlos desde tu cuenta, y puedes descargarlos o borrarlos cuando quieras.',
      consent: 'Acepto guardar mis datos, incluidos los de salud, en la nube.',
    },
    existing: EXISTING,
  },
  signup: {
    new: {
      title: 'Crea tu cuenta',
      intro:
        'Solo con tu correo, sin contraseña. Así guardamos tu avance y lo recuperas si cambias de teléfono o borras la app.',
      noticeTitle: 'Tus datos',
      notice:
        'Guardaremos en la nube tu perfil, lesiones, dolor, entrenamientos y medidas corporales. Son datos de salud: solo tú puedes verlos desde tu cuenta, y puedes descargarlos o borrar tu cuenta cuando quieras.',
      consent: 'Acepto guardar mis datos, incluidos los de salud, en la nube.',
    },
    existing: EXISTING,
  },
};

function ModeSwitch({ mode, signup, onChange }: { mode: Mode; signup: boolean; onChange: (mode: Mode) => void }) {
  const options: { value: Mode; label: string }[] = [
    { value: 'new', label: signup ? 'Soy nuevo' : 'Crear respaldo' },
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

type Props = {
  initialMode?: Mode;
  /** Paso de registro al empezar: textos de cuenta en vez de respaldo. */
  signup?: boolean;
  /** Al crear la cuenta nueva. Si no se indica, vuelve al inicio. */
  onCreated?: () => void;
};

export function BackupSetup({ initialMode = 'new', signup = false, onCreated }: Props) {
  const { enable } = useSync();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resent, setResent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un código sirve una sola vez: si falla lo que sigue, reintentar no debe volver a validarlo.
  const verified = useRef(false);

  const cleanEmail = cleanEmailInput(email);
  const emailOk = isEmail(cleanEmail);
  // El aviso aparece al salir del campo, no mientras la persona escribe.
  const [emailTouched, setEmailTouched] = useState(false);
  const emailWrong = emailTouched && cleanEmail.length > 0 && !emailOk;
  const copy = COPY[signup ? 'signup' : 'backup'][mode];

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
      setError(friendlyError(e, signup));
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
      // Solo en el registro inicial: pedir el código y no confirmarlo es un abandono que interesa medir.
      if (signup && mode === 'new') trackOnboarding('code_requested');
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
      await enable(mode === 'existing');
      if (signup) trackOnboarding(mode === 'new' ? 'account_created' : 'existing_account');
      // Al entrar a una cuenta que ya existe se trae su perfil: el inicio decide si falta completarlo.
      if (mode === 'new' && onCreated) onCreated();
      else router.replace('/');
    });

  return (
    <>
      <Text style={styles.title}>{copy.title}</Text>
      {!codeSent && <Text style={styles.body}>{copy.intro}</Text>}

      {!codeSent ? (
        <>
          <ModeSwitch mode={mode} signup={signup} onChange={changeMode} />

          <Text style={styles.label}>Tu correo</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            onBlur={() => setEmailTouched(true)}
            placeholder="tu@correo.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[styles.input, emailWrong && styles.inputWrong]}
          />
          {emailWrong && (
            <Text style={styles.error} testID="email-wrong">
              Revisa tu correo: debe verse como nombre@correo.com.
            </Text>
          )}

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

const styles = StyleSheet.create({
  title: { color: colors.text, ...display(28) },
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
  link: { color: colors.link, fontSize: 14, fontWeight: '700' },
  error: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  inputWrong: { borderColor: colors.warning },
});
