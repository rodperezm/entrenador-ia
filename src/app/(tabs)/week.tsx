import Ionicons from '@expo/vector-icons/Ionicons';
import { trainingStamp } from '@/domain/profileStamp';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { EXERCISES } from '@/data/exercises.seed';
import { cycleInfo } from '@/domain/cycle';
import { explainWeek } from '@/domain/explain';
import { AiProgress } from '@/features/planner/AiProgress';
import { CalendarReminder } from '@/features/planner/CalendarReminder';
import { WhyWeek } from '@/features/planner/WhyCards';
import { weekFocus } from '@/domain/strength';
import { DAY_LONG, dayDate, DAYS, isFromPastWeek, isToday, staleDays } from '@/domain/week';
import { countExercises, dayTypeLabel } from '@/features/planner/describe';
import { useGenerateWeek } from '@/features/planner/useGenerateWeek';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, display, radius, spacing } from '@/theme';

const SHORT_DAY = Object.fromEntries(DAYS.map((d) => [d.id, d.short]));

export default function WeekScreen() {
  const { profile } = useProfile();
  const { week, plan } = usePlan();
  const { sessions } = useHistory();
  const { generate, generating, notice } = useGenerateWeek();
  const [confirming, setConfirming] = useState(false);
  if (!profile) return null;

  const staleSet = plan ? staleDays(plan, week, trainingStamp(profile)) : new Set<string>();
  const stale = staleSet.size > 0;
  const activeDays = week.days.filter((d) => d.active).length;
  const cycle = cycleInfo(sessions, profile, week.days);
  const preparing = cycle.preparation;
  const hasCurrentPlan = !!plan?.days.length && !(activeDays > 0 && isFromPastWeek(plan.generatedAt));
  const hasConditions = profile.conditions.length > 0;
  const zones = weekFocus(week.days);
  const trainedOn = new Set(sessions.map((s) => new Date(s.finishedAt).toDateString()));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {activeDays} {activeDays === 1 ? 'día' : 'días'} de entrenamiento
      </Text>
      {hasCurrentPlan && !stale && (
        <WhyWeek
          explanation={explainWeek({
            days: plan.days,
            cycle,
            // Lo que hizo antes de armar la semana: contra eso se compara lo que cambia.
            history: sessions.filter((s) => s.finishedAt < plan.generatedAt),
            exercises: EXERCISES,
            weekDays: week.days,
          })}
          aiNote={plan.generator === 'llm' ? plan.summary : null}
        />
      )}
      {!hasCurrentPlan && (
        <Link href="/" style={styles.pending}>
          Arma tu semana desde Hoy ›
        </Link>
      )}
      {stale && hasCurrentPlan && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            Algunos días cambiaron desde la última rutina. Abre cada día marcado para rehacerlo.
          </Text>
        </View>
      )}

      {week.days.map((d) => {
        const dayPlan = plan?.days.find((p) => p.day === d.day);
        const date = dayDate(d.day);
        const today = isToday(d.day);
        const meta = [
          `${d.availableMinutes} min`,
          dayPlan ? `${countExercises(dayPlan)} ejercicios` : null,
          d.location === 'park' ? 'Parque' : 'Casa',
        ];
        return (
          <Link key={d.day} href={{ pathname: '/day/[day]', params: { day: d.day } }} asChild>
            <Pressable accessibilityRole="link"
              style={StyleSheet.flatten([styles.day, today && styles.dayToday])}
              accessibilityLabel={DAY_LONG[d.day]}
            >
              <View style={styles.date}>
                <Text style={[styles.dateDay, today && styles.accent]}>{today ? 'Hoy' : SHORT_DAY[d.day]}</Text>
                <Text style={[styles.dateNumber, !d.active && styles.muted]}>{date.getDate()}</Text>
              </View>
              <View style={styles.info}>
                <Text style={[styles.dayType, !d.active && styles.muted]}>
                  {dayTypeLabel(d, hasConditions, zones[d.day]?.focus)}
                </Text>
                {d.active && (
                  <Text style={[styles.meta, staleSet.has(d.day) && styles.metaStale]}>
                    {staleSet.has(d.day) ? 'Hay que rehacer este día' : meta.filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              {trainedOn.has(date.toDateString()) && (
                <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </Link>
        );
      })}

      {notice && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{notice}</Text>
        </View>
      )}
      {hasCurrentPlan && (
        <>
          {confirming ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmTitle}>¿Reemplazar tu semana?</Text>
              <Text style={styles.confirmText}>
                {preparing
                  ? 'Se volverán a armar tus días de preparación.'
                  : 'La IA armará tu semana de nuevo. Puede tardar hasta un minuto y medio.'}
              </Text>
              <Button
                label="Sí, reemplazar"
                onPress={() => {
                  setConfirming(false);
                  generate();
                }}
              />
              <Button label="Cancelar" variant="ghost" onPress={() => setConfirming(false)} />
            </View>
          ) : (
            <>
              <Button
                label={
                  generating
                    ? 'Armando tu semana…'
                    : preparing
                      ? 'Volver a armar mi preparación'
                      : 'Volver a generar mi semana con IA'
                }
                variant="secondary"
                onPress={() => setConfirming(true)}
                disabled={generating || activeDays === 0}
              />
              <AiProgress active={generating && !preparing} />
            </>
          )}
          {!confirming && (
            <Text style={styles.note}>
              {preparing
                ? 'Hasta el domingo, tus días los arma la app. El lunes te avisaremos en Hoy para crear tu semana con IA.'
                : 'Usa tu perfil, tus restricciones y tu historial. Puede tardar hasta un minuto y medio.'}
            </Text>
          )}
        </>
      )}
      <CalendarReminder />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 },
  title: { color: colors.text, ...display(26) },
  summary: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm },
  pending: { color: colors.link, fontSize: 15, fontWeight: '700', paddingVertical: spacing.sm },
  warn: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md },
  warnText: { color: colors.warning, fontSize: 13, lineHeight: 18 },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface,
    padding: spacing.md,
  },
  dayToday: { borderColor: colors.accent },
  date: { width: 38, alignItems: 'center' },
  dateDay: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  dateNumber: { color: colors.text, fontSize: 20, fontWeight: '800' },
  accent: { color: colors.accent },
  muted: { color: colors.textMuted },
  info: { flex: 1, gap: 2 },
  dayType: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13 },
  metaStale: { color: colors.warning },
  confirm: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  confirmTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  confirmText: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  note: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
