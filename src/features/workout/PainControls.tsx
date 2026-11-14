import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PainLevel, PainSide } from '@/domain/schema';
import { colors, radius, spacing } from '@/theme';

export const PAIN_OPTIONS: { label: string; level: PainLevel }[] = [
  { label: 'Nada', level: 0 },
  { label: 'Leve', level: 1 },
  { label: 'Moderado', level: 2 },
  { label: 'Fuerte', level: 3 },
];

const SIDE_OPTIONS: { label: string; side: PainSide }[] = [
  { label: 'Izquierdo', side: 'left' },
  { label: 'Derecho', side: 'right' },
  { label: 'Ambos', side: 'both' },
];

// En ejercicios a un lado, dónde dolió. Es opcional.
export function SidePicker({ side, onSide }: { side: PainSide | null; onSide: (s: PainSide) => void }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.label}>¿En qué lado?</Text>
      <View style={styles.sideChips}>
        {SIDE_OPTIONS.map((o) => (
          <Pressable accessibilityRole="button" aria-selected={!!(side === o.side)}
            key={o.side}
            onPress={() => onSide(o.side)}
            style={[styles.chip, side === o.side && styles.painOn]}
          >
            <Text style={[styles.chipText, side === o.side && { color: colors.bg }]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// «¿Algo dolió?» plegado: solo se abre si el usuario lo toca.
export function PainPicker({
  open,
  onOpen,
  pain,
  onPain,
}: {
  open: boolean;
  onOpen: () => void;
  pain: PainLevel | null;
  onPain: (p: PainLevel | null) => void;
}) {
  if (!open)
    return (
      <Pressable accessibilityRole="button" onPress={onOpen} hitSlop={8}>
        <Text style={styles.link}>¿Algo dolió?</Text>
      </Pressable>
    );
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.label}>¿Sentiste molestia o dolor?</Text>
      <View style={styles.chips}>
        {PAIN_OPTIONS.map((o) => {
          const on = pain === o.level;
          return (
            <Pressable accessibilityRole="button" aria-selected={!!(on)}
              key={o.level}
              onPress={() => onPain(on ? null : o.level)}
              style={[styles.chip, on && (o.level === 0 ? styles.chipOn : styles.painOn)]}
            >
              <Text style={[styles.chipText, on && { color: o.level === 0 ? colors.onAccent : colors.bg }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {pain === 3 && (
        <Text style={styles.painWarn}>
          Si el dolor es fuerte, detén este ejercicio. Te avisaremos para cambiarlo por uno más suave.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  link: { color: colors.textMuted, fontWeight: '700', fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1, justifyContent: 'flex-end' },
  sideChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minWidth: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  chipOn: { backgroundColor: colors.accent },
  painOn: { backgroundColor: colors.warning },
  chipText: { color: colors.text, fontWeight: '700' },
  painWarn: { color: colors.warning, fontSize: 13, lineHeight: 18 },
});
