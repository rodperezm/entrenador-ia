import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';

type Item = { label: string; icon: keyof typeof Ionicons.glyphMap; href: Href };

const ITEMS: Item[] = [
  { label: 'Mi perfil', icon: 'person-outline', href: '/profile' },
  { label: 'Cuenta y respaldo', icon: 'shield-checkmark-outline', href: '/account' },
  { label: 'Enviar un comentario', icon: 'chatbubble-ellipses-outline', href: '/feedback' },
];

// Botón de la esquina superior: abre un menú corto con el perfil y la cuenta,
// para que «Cuenta y respaldo» quede a un toque desde cualquier pestaña.
export function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const go = (href: Href) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Perfil y cuenta"
        hitSlop={8}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="person-circle-outline" size={30} color={colors.text} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityRole="button" style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Cerrar el menú">
          <View style={styles.menu} accessibilityRole="menu">
            {ITEMS.map((item, i) => (
              <Pressable
                key={item.label}
                onPress={() => go(item.href)}
                accessibilityRole="menuitem"
                style={({ pressed }) => [styles.item, i > 0 && styles.divider, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name={item.icon} size={22} color={colors.text} />
                <Text style={styles.label}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { paddingHorizontal: spacing.lg, minHeight: 44, justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: colors.backdrop, alignItems: 'flex-end' },
  menu: {
    marginTop: 56,
    marginRight: spacing.md,
    minWidth: 230,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, minHeight: 52 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
