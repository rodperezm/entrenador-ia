import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { TERMS_VERSION } from '@/content/terms';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

// Para quien ya tenía su perfil cuando se publicaron (o cambiaron) los Términos: un aviso en «Hoy»
// para leerlos y aceptarlos. No bloquea el entrenamiento; queda hasta que la persona acepte.
export function TermsNotice() {
  const { profile, saveProfile } = useProfile();
  const [saving, setSaving] = useState(false);
  if (!profile || profile.termsVersion === TERMS_VERSION) return null;

  const accept = async () => {
    setSaving(true);
    const { updatedAt: _u, trainingUpdatedAt: _t, ...rest } = profile;
    await saveProfile({ ...rest, termsVersion: TERMS_VERSION, termsAcceptedAt: new Date().toISOString() });
    setSaving(false);
  };

  return (
    <View style={styles.card} testID="terms-notice">
      <Text style={styles.title}>{profile.termsVersion ? 'Actualizamos los Términos' : 'Términos y condiciones'}</Text>
      <Text style={styles.body}>
        Dejamos por escrito las condiciones de uso de KETTAI: qué hace la app, qué no, y cómo cuidamos tus datos. Léelos
        y acéptalos para seguir.
      </Text>
      <View style={styles.actions}>
        <Button label="Leer" variant="secondary" onPress={() => router.push('/terms')} />
        <Button label={saving ? 'Guardando…' : 'Acepto'} onPress={accept} disabled={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});
