import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { EXERCISES } from '@/data/exercises.seed';
import { cycleInfo } from '@/domain/cycle';
import { missingPatterns } from '@/domain/patterns';
import { isFromPastWeek, nextMondayLabel } from '@/domain/week';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';
import { AiProgress } from './AiProgress';

// Recuadro semanal de Hoy: siempre visible, se activa cuando toca armar la semana.
export function WeekCard({ generating, onGenerate }: { generating: boolean; onGenerate: () => void }) {
  const { profile } = useProfile();
  const { week, plan } = usePlan();
  const { sessions } = useHistory();
  if (!profile || !week.days.some((d) => d.active)) return null;

  const cycle = cycleInfo(sessions, profile.level, week.days);
  const armed = !!plan?.days.length && !isFromPastWeek(plan.generatedAt);

  if (cycle.preparation) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <Text style={styles.title}>Tu semana con IA</Text>
        </View>
        <Text style={styles.detail}>
          Cada lunes la IA arma tu semana con lo que registraste: pesos, esfuerzo y molestias.
        </Text>
        <View style={styles.locked}>
          <Text style={styles.lockedText}>Se activa el {nextMondayLabel()}</Text>
        </View>
      </View>
    );
  }

  if (!armed) {
    return (
      <View style={[styles.card, styles.active]}>
        <View style={styles.header}>
          <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
          <Text style={styles.title}>Tu Semana {cycle.week} está lista para armarse</Text>
        </View>
        <Text style={styles.detail}>
          La IA usa lo que registraste: pesos, esfuerzo y molestias.
          {generating ? '' : ' Puede tardar hasta un minuto y medio.'}
        </Text>
        <Button
          label={generating ? 'La IA está armando tu semana…' : `Armar mi Semana ${cycle.week} con IA`}
          onPress={onGenerate}
          disabled={generating}
        />
        <AiProgress active={generating} />
      </View>
    );
  }

  const byAi = plan.generator === 'llm';
  const missing = missingPatterns(plan.days, week, profile, EXERCISES);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="checkmark-circle-outline" size={18} color={colors.accent} />
        <Text style={styles.title}>Tu semana {cycle.week} está lista</Text>
      </View>
      <Text style={styles.detail}>
        {byAi
          ? `La armó la IA con lo que registraste. La próxima se activa el ${nextMondayLabel()}.`
          : 'La armamos con las reglas de la app. Si quieres, pídela con IA en la pestaña Semana.'}
      </Text>
      {missing.map((m) => (
        <View key={m.label} style={styles.missing}>
          <Text style={styles.missingTitle}>Esta semana no hay ejercicios de {m.label}</Text>
          <Text style={styles.detail}>{m.reason}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  active: { borderColor: colors.accent },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  detail: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  locked: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  lockedText: { color: colors.textMuted, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  missing: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  missingTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
});
