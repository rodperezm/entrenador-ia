import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { KeyboardDoneBar } from '@/components/KeyboardDoneBar';
import { Button } from '@/components/ui';
import { BackupSetup } from '@/features/account/BackupSetup';
import { buildDataWorkbook } from '@/features/account/excelExport';
import { useBody } from '@/state/body';
import { useHistory } from '@/state/history';
import { useProfile } from '@/state/profile';
import { useSync } from '@/state/sync';
import { colors, radius, spacing } from '@/theme';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Solo web: descarga el archivo con un enlace temporal.
function saveFile(blob: Blob, name: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

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
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Cuenta y respaldo' }} />
        {enabled ? <BackupActive /> : <BackupSetup initialMode={mode === 'existing' ? 'existing' : 'new'} />}
      </ScrollView>
      <KeyboardDoneBar />
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
  const { status, email, lastSyncAt, syncNow, signOut, signInAgain, removeAccount, wipeLocal, exportData } = useSync();
  const { profile } = useProfile();
  const { sessions } = useHistory();
  const { records, folds } = useBody();
  const [error, setError] = useState<string | null>(null);

  const lost = status === 'signed_out';
  const pending = status === 'pending' || lost;
  const statusText = {
    off: 'Respaldo apagado',
    syncing: 'Sincronizando…',
    ok: 'Todo al día',
    pending: 'Pendiente: se sube apenas haya conexión.',
    signed_out: 'Tu sesión se cerró en este teléfono. El respaldo está en pausa: vuelve a entrar con tu correo.',
  }[status];
  // Vuelve a la pantalla de entrar, en modo «Ya tengo cuenta». Lo del teléfono no se toca.
  const goSignIn = async () => {
    router.setParams({ mode: 'existing' });
    await signInAgain();
  };
  const lastCopy = lastSyncAt
    ? new Date(lastSyncAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const download = async () => {
    const json = exportData();
    if (Platform.OS === 'web') {
      saveFile(new Blob([json], { type: 'application/json' }), 'mis-datos-kettai.json');
      return;
    }
    await Share.share({ title: 'Mis datos de KETTAI', message: json });
  };

  const downloadExcel = () => {
    const bytes = buildDataWorkbook({ profile, sessions, records, folds });
    saveFile(new Blob([bytes as BlobPart], { type: XLSX_TYPE }), 'mis-datos-kettai.xlsx');
  };

  const askSignOut = () =>
    confirmAction(
      '¿Cerrar sesión en este teléfono?',
      'Dejará de sincronizar. Tu respaldo y lo guardado en este teléfono se mantienen.',
      'Cerrar sesión',
      signOut,
    );

  const askWipe = () =>
    confirmAction(
      '¿Borrar los datos de este teléfono?',
      pending
        ? 'Hay cambios que todavía no se copian a tu respaldo: si borras ahora, se pierden. Se cierra la sesión y este teléfono queda como nuevo.'
        : 'Se cierra la sesión y este teléfono queda como nuevo. Tu respaldo en la nube se mantiene: lo recuperas entrando con tu correo.',
      'Borrar de este teléfono',
      () =>
        wipeLocal()
          .then(() => router.replace('/onboarding'))
          .catch(() => setError('No se pudo borrar. Inténtalo de nuevo.')),
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
      {lost ? (
        <Button label="Volver a entrar con mi correo" onPress={goSignIn} />
      ) : (
        <Button
          label={status === 'syncing' ? 'Sincronizando…' : 'Sincronizar ahora'}
          onPress={syncNow}
          disabled={status === 'syncing'}
        />
      )}

      <Text style={styles.section}>Tus datos</Text>
      <View style={styles.group}>
        {Platform.OS === 'web' && (
          <>
            <ActionRow icon="grid-outline" label="Descargar mis datos en Excel" onPress={downloadExcel} />
            <View style={styles.rowDivider} />
          </>
        )}
        <ActionRow icon="download-outline" label="Descargar respaldo completo (JSON)" onPress={download} />
        <View style={styles.rowDivider} />
        <ActionRow icon="lock-closed-outline" label="Cómo cuidamos tus datos" onPress={() => router.push('/privacy')} />
      </View>

      <Text style={styles.section}>Tu cuenta</Text>
      <View style={styles.group}>
        <ActionRow icon="log-out-outline" label="Cerrar sesión en este teléfono" onPress={askSignOut} />
        <View style={styles.rowDivider} />
        <ActionRow icon="phone-portrait-outline" label="Borrar los datos de este teléfono" onPress={askWipe} />
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
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
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
