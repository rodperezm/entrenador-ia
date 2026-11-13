import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EXERCISES } from '@/data/exercises.seed';
import { progressSummary } from '@/domain/progress';
import { fmtDayDate } from '@/domain/week';
import { useHistory } from '@/state/history';
import { colors, display, radius, spacing } from '@/theme';

const PAIN_LABEL = ['', 'Molestia leve', 'Dolor moderado', 'Dolor fuerte'];

export default function ProgressScreen() {
  const { sessions } = useHistory();
  const p = progressSummary(sessions, EXERCISES);

  if (!p.sessions) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Ionicons name="trending-up" size={40} color={colors.accent} />
        <Text style={styles.emptyTitle}>Tu progreso parte aquí</Text>
        <Text style={styles.emptyText}>
          Cuando termines tu primera sesión, verás tu constancia y cómo mejoran tus ejercicios de Fuerza.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.stats}>
        <Stat value={String(p.sessions)} label={p.sessions === 1 ? 'Sesión' : 'Sesiones'} />
        <Stat value={String(p.thisWeek)} label="Esta semana" />
        <Stat value={String(p.weeksInARow)} label={p.weeksInARow === 1 ? 'Semana activa' : 'Semanas seguidas'} />
        <Stat value={String(p.minutes)} label="Minutos" />
      </View>

      <Text style={styles.section}>Tus ejercicios de Fuerza</Text>
      {p.exercises.length ? (
        p.exercises.map((e) => (
          <Link key={e.id} href={{ pathname: '/exercise/[id]', params: { id: e.id } }} asChild>
            <Pressable accessibilityRole="link" style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{e.name}</Text>
                <Text style={styles.rowDetail}>
                  {e.sessions === 1 ? `Primera marca: ${e.last}` : `${e.first} → ${e.last}`}
                </Text>
              </View>
              {e.improved && <Ionicons name="trending-up" size={22} color={colors.accent} />}
            </Pressable>
          </Link>
        ))
      ) : (
        <Text style={styles.rowDetail}>Aún no registras ejercicios de Fuerza.</Text>
      )}

      {p.amrap.length > 0 && (
        <>
          <Text style={styles.section}>Tus desafíos AMRAP</Text>
          {p.amrap.map((a) => (
            <View key={a.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{a.name}</Text>
                <Text style={styles.rowDetail}>{a.times === 1 ? `Primera marca: ${a.last}` : `${a.first} → ${a.last}`}</Text>
              </View>
              {a.improved && <Ionicons name="trending-up" size={22} color={colors.accent} />}
            </View>
          ))}
        </>
      )}

      {p.pains.length > 0 && (
        <>
          <Text style={styles.section}>Molestias recientes</Text>
          {p.pains.map((n) => (
            <View key={n.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{n.name}</Text>
                <Text style={styles.pain}>
                  {PAIN_LABEL[n.level]} · {fmtDayDate(n.date)}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: colors.text, ...display(26), textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { flexBasis: '48%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  statValue: { color: colors.text, fontSize: 28, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 13 },
  section: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowDetail: { color: colors.textMuted, fontSize: 14 },
  pain: { color: colors.warning, fontSize: 14 },
});
