import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';

// El teclado numérico de iPhone no trae tecla para cerrarse: esta barra lo reemplaza.
// Va fuera del KeyboardAvoidingView, como hermana, para quedar justo sobre el teclado.
export function KeyboardDoneBar() {
  const [keyboardHeight, setKeyboardHeight] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboardHeight == null) return null;
  return (
    <View style={[styles.bar, { bottom: keyboardHeight }]}>
      <Pressable
        onPress={Keyboard.dismiss}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.done}>Listo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  button: {
    minWidth: 160,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  pressed: { opacity: 0.8 },
  done: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
