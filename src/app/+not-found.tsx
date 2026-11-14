import { router, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { colors, display, spacing } from '@/theme';

// Dirección que no existe (un enlace antiguo o mal escrito): en vez de la página en inglés que
// trae Expo Router, se explica en español y se ofrece volver al inicio.
export default function NotFound() {
  return (
    <View style={styles.screen} testID="not-found">
      <Stack.Screen options={{ title: '' }} />
      <Text style={styles.title}>Esta página no existe</Text>
      <Text style={styles.body}>Puede que el enlace sea antiguo o esté mal escrito. Tus datos siguen guardados.</Text>
      <Button label="Volver al inicio" onPress={() => router.replace('/')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { color: colors.text, ...display(32) },
  body: { color: colors.textMuted, fontSize: 16, lineHeight: 23 },
});
