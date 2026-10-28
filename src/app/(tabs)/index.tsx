import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { DAY_LONG, dayDate, fmtDayDate, isToday, staleDays } from '@/domain/week';
import { countExercises, describeDayConfig } from '@/features/planner/describe';
import { useGenerateWeek } from '@/features/planner/useGenerateWeek';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

export default function WeekScreen() {
  const { profile } = useProfile();
  const { week, plan } = usePlan();
  const { generate, generating, notice } = useGenerateWeek();
  if (!profile) return null;

  const staleSet = plan ? staleDays(plan, week, profile.updatedAt) : new Set<string>();
  const stale = staleSet.size > 0;
  const activeDays = week.days.filter((d) => d.active).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hello}>{profile.displayName ? `Hola, ${profile.displayName}` : 'Hola'} 👋</Text>
      <Text style={styles.lead}>
        Configura cada día y genera tu rutina. {activeDays} {activeDays === 1 ? 'día' : 'días'} de entrenamiento.
      </Text>

      {week.days.map((d) => {
        const dayPlan = plan?.days.find((p) => p.day === d.day);
        return (
          <Link key={d.day} href={{ pathname: '/day/[day]', params: { day: d.day } }} asChild>
            <Pressable>
              <View style={[styles.day, !d.active && styles.dayRest]}>
                <View style={styles.dayHead}>
                  <Text style={[styles.dayName, !d.active && { color: colors.textMuted }]}>{DAY_LONG[d.day]}</Text>
                  <Text style={[styles.dayDate, isToday(d.day) && styles.dayToday]} numberOfLines={1}>
                    {isToday(d.day) ? 'Hoy · ' : ''}
                    {fmtDayDate(dayDate(d.day))}
                  </Text>
                  {d.active && (
                    <View style={styles.loc}>
                      <Ionicons
                        name={d.location === 'park' ? 'leaf-outline' : 'home-outline'}
                        size={13}
                        color={colors.textMuted}
                      />
                      <Text style={styles.locText}>{d.location === 'park' ? 'Parque' : 'Casa'}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
                </View>
                <Text style={styles.dayDesc}>{describeDayConfig(d, profile.conditions.length > 0)}</Text>
                {d.active && dayPlan && (
                  <Text style={[styles.badge, staleSet.has(d.day) && styles.badgeStale]}>
                    {countExercises(dayPlan)} ejercicios{staleSet.has(d.day) ? ' · desactualizada' : ''}
                  </Text>
                )}
              </View>
            </Pressable>
          </Link>
        );
      })}

      {stale && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            Algunos días cambiaron desde la última rutina. Rehaz solo esos días desde su pantalla o vuelve a generar la
            semana.
          </Text>
        </View>
      )}
      {plan && !stale && (
        <Text style={styles.summary}>
          {plan.generator === 'llm' ? '✨ Armada con IA · ' : ''}
          {plan.summary}
        </Text>
      )}
      {notice && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{notice}</Text>
        </View>
      )}

      <Button
        label={generating ? 'Armando tu semana…' : plan ? 'Volver a generar mi semana' : 'Generar mi semana'}
        onPress={generate}
        disabled={generating || activeDays === 0}
      />
      <Text style={styles.note}>
        La IA arma tu semana con tu perfil, tus restricciones y tu historial. Puede tardar hasta un minuto.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dayDate: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  dayToday: { color: colors.accent },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  hello: { color: colors.text, fontSize: 26, fontWeight: '800' },
  lead: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.sm },
  day: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: 6 },
  dayRest: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayName: { color: colors.text, fontSize: 17, fontWeight: '800' },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  locText: { color: colors.textMuted, fontSize: 12 },
  dayDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  badge: {
    alignSelf: 'flex-start',
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  badgeStale: { color: colors.warning, backgroundColor: colors.warningSoft },
  warn: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md },
  warnText: { color: colors.warning, fontSize: 13, lineHeight: 18 },
  summary: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  note: { color: colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
