import { useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, display, radius, spacing } from '@/theme';

// Confirmación con el estilo de la app, en vez del cuadro del navegador o del sistema.
// El botón dice lo que hace («Borrar de este teléfono»), no «Aceptar».
type Request = {
  title: string;
  message: string;
  /** Texto del botón que confirma. */
  label: string;
  /** La acción borra algo o no se puede deshacer: el botón va en rojo. */
  danger?: boolean;
  onConfirm: () => void;
};

let current: Request | null = null;
const listeners = new Set<() => void>();
const set = (next: Request | null) => {
  current = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Pide confirmación. Se puede llamar desde cualquier parte; lo muestra <ConfirmHost />. */
export const confirmAction = (request: Request) => set(request);

/** Va una sola vez, en la raíz de la app. */
export function ConfirmHost() {
  const request = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const close = () => set(null);
  const confirm = () => {
    const run = request?.onConfirm;
    close();
    run?.();
  };

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert" accessibilityViewIsModal>
          <Text style={styles.title}>{request?.title}</Text>
          <Text style={styles.message}>{request?.message}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={confirm}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                request?.danger ? styles.danger : styles.primary,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[styles.buttonText, request?.danger ? styles.dangerText : styles.primaryText]}>
                {request?.label}
              </Text>
            </Pressable>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, styles.cancel, pressed && { opacity: 0.8 }]}
            >
              <Text style={[styles.buttonText, styles.cancelText]}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { color: colors.text, ...display(24) },
  message: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  button: {
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  primary: { backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.text },
  primaryText: { color: colors.text },
  danger: { backgroundColor: colors.accent },
  dangerText: { color: colors.onAccent },
  cancel: { borderWidth: 1.5, borderColor: colors.border },
  cancelText: { color: colors.text },
});
