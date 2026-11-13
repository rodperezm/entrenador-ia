import * as Linking from 'expo-linking';
import { type ErrorBoundaryProps, router } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { colors, spacing } from '@/theme';

// Lo que se ve si una pantalla falla: en vez de quedar en blanco, explica y deja salir.
// Lo registrado no se pierde: el entrenamiento en curso se guarda después de cada serie.
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  const goHome = () => {
    // En la web se recarga desde el inicio: es lo único que saca con seguridad de una pantalla rota.
    if (Platform.OS === 'web') {
      window.location.assign(Linking.createURL('/'));
      return;
    }
    router.replace('/');
    setTimeout(() => void retry(), 50);
  };
  // El detalle queda en la consola para poder revisarlo; a la persona no le sirve.
  console.error('Pantalla con error:', error);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Algo salió mal en esta pantalla</Text>
      <Text style={styles.body}>Tus datos están guardados. Puedes volver al inicio y seguir.</Text>
      <View style={styles.actions}>
        <Button label="Volver al inicio" onPress={goHome} />
        <Button label="Reintentar" variant="ghost" onPress={() => void retry()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', lineHeight: 32 },
  body: { color: colors.textMuted, fontSize: 16, lineHeight: 23 },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
