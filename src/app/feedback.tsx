import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardDoneBar } from '@/components/KeyboardDoneBar';
import { Button } from '@/components/ui';
import { isOnline } from '@/lib/online';
import { sendReport } from '@/lib/report';
import { colors, display, radius, spacing } from '@/theme';

const MAX_LENGTH = 2000;

// Un lugar simple para contarnos qué falló, qué no se entendió o qué falta.
export default function FeedbackScreen() {
  const [text, setText] = useState('');
  const [state, setState] = useState<'writing' | 'sending' | 'sent' | 'failed'>('writing');

  const send = async () => {
    setState('sending');
    const ok = isOnline() && (await sendReport('feedback', text));
    setState(ok ? 'sent' : 'failed');
  };

  if (state === 'sent') {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.title}>Gracias</Text>
        <Text style={styles.body}>Recibimos tu comentario. Lo leemos todos.</Text>
        <Button label="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Cuéntanos</Text>
          <Text style={styles.body}>
            ¿Algo falló, no se entendió o te gustaría que fuera distinto? Escríbelo con tus palabras.
          </Text>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (state === 'failed') setState('writing');
            }}
            placeholder="Por ejemplo: al terminar el entrenamiento no pude guardar…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            maxLength={MAX_LENGTH}
            textAlignVertical="top"
            accessibilityLabel="Tu comentario"
          />
          <Text style={styles.note}>
            Enviamos tu texto, la versión de la app y el tipo de teléfono. No se envían tus entrenamientos ni tus
            datos de salud: no los escribas aquí.
          </Text>
          {state === 'failed' && (
            <Text style={styles.error}>No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.</Text>
          )}
          <Button
            label={state === 'sending' ? 'Enviando…' : 'Enviar comentario'}
            onPress={send}
            disabled={state === 'sending' || text.trim().length < 3}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <KeyboardDoneBar />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  title: { color: colors.text, ...display(32) },
  body: { color: colors.textMuted, fontSize: 16, lineHeight: 23 },
  input: {
    minHeight: 160,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    padding: spacing.md,
  },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  error: { color: colors.warning, fontSize: 14, lineHeight: 20 },
});
