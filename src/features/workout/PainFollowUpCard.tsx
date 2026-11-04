import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EXERCISES } from '@/data/exercises.seed';
import { pendingPainFollowUp } from '@/domain/checkIn';
import type { PainFollowUp } from '@/domain/schema';
import { useHistory } from '@/state/history';
import { colors, radius, spacing } from '@/theme';

const NAMES = new Map(EXERCISES.map((e) => [e.id, e.name.es]));
const OPTIONS: { id: PainFollowUp; label: string }[] = [
  { id: 'better', label: 'Mejor' },
  { id: 'same', label: 'Igual' },
  { id: 'worse', label: 'Peor' },
];

// Al día siguiente de un dolor moderado o fuerte: con «Peor», esos ejercicios se cambian.
export function PainFollowUpCard() {
  const { sessions, updateSession } = useHistory();
  const pending = pendingPainFollowUp(sessions, NAMES);
  if (!pending) return null;
  const where =
    pending.where.length > 1 ? `${pending.where.slice(0, -1).join(', ')} y ${pending.where.at(-1)}` : pending.where[0];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>¿Cómo amaneció la molestia?</Text>
      <Text style={styles.body}>La última vez marcaste dolor en {where}.</Text>
      <View style={styles.row}>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => updateSession(pending.sessionId, { painFollowUp: o.id })}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.chipText}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  chipText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
