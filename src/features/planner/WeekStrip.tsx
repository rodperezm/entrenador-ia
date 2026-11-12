import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dayDate, DAYS, isToday } from '@/domain/week';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { colors, radius, spacing } from '@/theme';

// La semana de un vistazo: cada día se abre con un toque.
export function WeekStrip() {
  const { week } = usePlan();
  const { sessions } = useHistory();
  const trainedOn = new Set(sessions.map((s) => new Date(s.finishedAt).toDateString()));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Tu semana</Text>
        <Link href="/week" style={styles.link}>
          Ver semana ›
        </Link>
      </View>
      <View style={styles.days}>
        {DAYS.map((d) => {
          const date = dayDate(d.id);
          const active = week.days.find((w) => w.day === d.id)?.active;
          const today = isToday(d.id);
          return (
            <Link key={d.id} href={{ pathname: '/day/[day]', params: { day: d.id } }} asChild>
              <Pressable style={StyleSheet.flatten([styles.day, today && styles.today])} accessibilityLabel={d.long}>
                <Text style={[styles.letter, today && styles.todayText]}>{d.short[0]}</Text>
                <Text style={[styles.number, !active && styles.rest, today && styles.todayText]}>{date.getDate()}</Text>
                {trainedOn.has(date.toDateString()) ? (
                  <Ionicons name="checkmark" size={14} color={today ? colors.onAccent : colors.accent} />
                ) : (
                  <View style={[styles.dot, active && styles.dotOn, today && active && styles.dotToday]} />
                )}
              </Pressable>
            </Link>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  link: { color: colors.link, fontSize: 14, fontWeight: '700' },
  days: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, minHeight: 66, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.md },
  today: { backgroundColor: colors.accent },
  letter: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  number: { color: colors.text, fontSize: 16, fontWeight: '800' },
  rest: { color: colors.textMuted },
  todayText: { color: colors.onAccent },
  dot: { width: 6, height: 6, borderRadius: 3, marginVertical: 4 },
  dotOn: { backgroundColor: colors.accent },
  dotToday: { backgroundColor: colors.onAccent },
});
