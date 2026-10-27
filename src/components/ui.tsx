import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.buttonPrimary : styles.buttonGhost,
        disabled && styles.disabled,
        pressed && !disabled && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.buttonText, variant === 'ghost' && { color: colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

// Tarjeta seleccionable (opción única o múltiple).
export function OptionCard({
  title,
  description,
  selected,
  onPress,
  locked,
  children,
}: {
  title: string;
  description?: string;
  selected: boolean;
  onPress?: () => void;
  locked?: boolean;
  children?: ReactNode;
}) {
  return (
    <Pressable onPress={locked ? undefined : onPress} style={[styles.card, selected && styles.cardSelected]}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {description ? <Text style={styles.cardDesc}>{description}</Text> : null}
        </View>
        {locked ? <Text style={styles.lockedTag}>BASE</Text> : <Check checked={selected} />}
      </View>
      {children}
    </Pressable>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  suffix = '',
  step = 1,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        style={[styles.stepBtn, value <= min && styles.disabled]}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>
        {value}
        {suffix}
      </Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        style={[styles.stepBtn, value >= max && styles.disabled]}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function CheckRow({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.checkRow}>
      <Check checked={checked} small />
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

function Check({ checked, small }: { checked: boolean; small?: boolean }) {
  const size = small ? 20 : 24;
  return (
    <View style={[styles.check, { width: size, height: size, borderRadius: size / 3 }, checked && styles.checkOn]}>
      {checked && <Text style={[styles.checkMark, small && { fontSize: 12 }]}>✓</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: 16, borderRadius: radius.pill, alignItems: 'center' },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.35 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  lockedTag: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  check: { borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#fff', fontWeight: '900', fontSize: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: colors.text, fontSize: 20, fontWeight: '700', lineHeight: 22 },
  stepValue: { color: colors.text, fontSize: 18, fontWeight: '800', minWidth: 44, textAlign: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  checkLabel: { color: colors.text, fontSize: 14, flex: 1 },
});
