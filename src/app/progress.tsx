import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { cycleInfo } from '@/domain/cycle';
import { type ExerciseProgress, progressSummary } from '@/domain/progress';
import { A_STAGES, anchorIds } from '@/domain/strength';
import { fmtDayDate } from '@/domain/week';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, display, radius, spacing } from '@/theme';

// «Tu progreso» responde, en orden, lo que la persona se pregunta: ¿voy bien?, ¿estoy siendo
// constante?, ¿estoy más fuerte?, ¿qué viene? y ¿cómo responde mi cuerpo? Todo sale de lo que ya
// registró al entrenar; no se le pide nada nuevo.

const PAIN_LABEL = ['', 'Molestia leve', 'Dolor moderado', 'Dolor fuerte'];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function ProgressScreen() {
  const { sessions } = useHistory();
  const { plan, week } = usePlan();
  const { profile } = useProfile();
  const [showAll, setShowAll] = useState(false);
  const p = progressSummary(sessions, EXERCISES);

  if (!p.sessions) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Ionicons name="trending-up" size={40} color={colors.accent} />
        <Text style={styles.emptyTitle}>Tu progreso empieza aquí</Text>
        <Text style={styles.emptyText}>
          Cuando termines tu primera sesión, verás tu constancia, cómo mejoran tus ejercicios de Fuerza y tu avance con
          la kettlebell.
        </Text>
      </View>
    );
  }

  // Los ejercicios ancla del ciclo son los que se repiten para medir el avance: van primero.
  const anchors = new Set(
    (plan?.days ?? []).flatMap((d) =>
      anchorIds(
        d.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots),
        EXERCISES_BY_ID,
      ),
    ),
  );
  const ranked = [...p.exercises].sort(
    (a, b) => Number(anchors.has(b.id)) - Number(anchors.has(a.id)) || b.sessions - a.sessions,
  );
  const featured = ranked.filter((e) => anchors.has(e.id)).slice(0, 4);
  const main = featured.length ? featured : ranked.slice(0, 3);
  const rest = ranked.filter((e) => !main.includes(e));
  const improved = p.exercises.filter((e) => e.improved).length;

  const cycle = profile ? cycleInfo(sessions, profile, week.days) : null;
  const stageName = (n: number) => EXERCISES_BY_ID.get(A_STAGES[n - 1]?.[0] ?? '')?.name.es ?? null;
  const strongPain = p.pains.some((n) => n.level === 3);

  // Una sola frase arriba: lo más importante, antes que cualquier número.
  const facts = [
    p.weeksInARow >= 2 ? `${p.weeksInARow} semanas seguidas` : null,
    improved ? `más fuerte en ${plural(improved, 'ejercicio', 'ejercicios')}` : null,
  ].filter(Boolean);
  const headline = strongPain
    ? 'Cuida lo que duele: cambiamos el ejercicio que marcaste con dolor fuerte'
    : facts.length
      ? `Vas bien: ${facts.join(' y ')}`
      : p.thisWeek
        ? `Buen comienzo: ${plural(p.sessions, 'sesión', 'sesiones')} en total`
        : 'Esta semana aún no entrenas. Retoma cuando puedas: lo avanzado no se pierde';

  const top = Math.max(1, ...p.weeks.map((w) => w.count));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.card, styles.headlineCard]}>
        <Text style={styles.headline} testID="progress-headline">
          {headline}
        </Text>
        <Text style={styles.note}>
          {plural(p.sessions, 'sesión', 'sesiones')}
          {p.minutes ? ` · ${p.minutes} min en total` : ''}
        </Text>
      </View>

      <Card icon="calendar-outline" title={`Constancia · últimas ${p.weeks.length} semanas`}>
        <View style={styles.bars} accessibilityLabel={`Sesiones por semana: ${p.weeks.map((w) => w.count).join(', ')}`}>
          {p.weeks.map((w, i) => (
            <View key={w.monday} style={styles.barColumn}>
              <Text style={styles.barValue}>{w.count || ''}</Text>
              <View
                style={[
                  styles.bar,
                  { height: w.count ? 8 + (48 * w.count) / top : 3 },
                  w.count === 0 && styles.barEmpty,
                  i === p.weeks.length - 1 && w.count > 0 && styles.barNow,
                ]}
              />
            </View>
          ))}
        </View>
        <Text style={styles.note}>
          {p.thisWeek
            ? `Esta semana llevas ${plural(p.thisWeek, 'sesión', 'sesiones')}.`
            : 'Esta semana aún no registras sesiones.'}
          {p.weeksInARow >= 2 ? ` Vas en ${p.weeksInARow} semanas seguidas.` : ''}
        </Text>
      </Card>

      <Card icon="barbell-outline" title={featured.length ? 'Tu fuerza · ejercicios ancla del ciclo' : 'Tu fuerza'}>
        {main.length ? (
          main.map((e) => <ExerciseRow key={e.id} e={e} />)
        ) : (
          <Text style={styles.note}>Aún no registras ejercicios de Fuerza.</Text>
        )}
        {showAll && rest.map((e) => <ExerciseRow key={e.id} e={e} />)}
        {rest.length > 0 && (
          <Pressable accessibilityRole="button" onPress={() => setShowAll(!showAll)} hitSlop={8}>
            <Text style={styles.link}>{showAll ? 'Ver menos' : `Ver todos los ejercicios (${rest.length} más)`}</Text>
          </Pressable>
        )}
      </Card>

      {cycle && stageName(cycle.stage) ? (
        <Card icon="trending-up" title="Tu camino con la kettlebell">
          <View style={styles.steps}>
            {A_STAGES.map((_, i) => (
              <View key={i} style={[styles.step, i < cycle.stage && styles.stepDone]} />
            ))}
          </View>
          <Text style={styles.rowTitle}>
            Etapa {cycle.stage} de {A_STAGES.length} · {stageName(cycle.stage)}
          </Text>
          <Text style={styles.note}>
            {cycle.stage < A_STAGES.length
              ? `Siguiente: ${stageName(cycle.stage + 1)}. Se abre cuando confirmas buena técnica y sin dolor.`
              : 'Llegaste a la última etapa: ya tienes disponibles todos los movimientos.'}
          </Text>
        </Card>
      ) : null}

      <Card icon="heart-outline" title="Cómo responde tu cuerpo · 4 semanas">
        {p.body.sessions ? (
          <View style={styles.stats}>
            <Stat value={`${p.body.painFree} de ${p.body.sessions}`} label="Sesiones sin molestias" />
            {p.body.answered ? (
              <Stat value={`${p.body.right} de ${p.body.answered}`} label="Terminaste «justo»" />
            ) : null}
          </View>
        ) : (
          <Text style={styles.note}>Sin sesiones en las últimas 4 semanas.</Text>
        )}
        {p.body.wantedMore + p.body.tooMuch > 0 && (
          <Text style={styles.note}>
            {[
              p.body.wantedMore ? `${plural(p.body.wantedMore, 'vez', 'veces')} con ganas de más` : null,
              p.body.tooMuch ? `${plural(p.body.tooMuch, 'vez', 'veces')} «fue mucho»` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
        {p.pains.map((n) => (
          <Text key={n.id} style={styles.pain}>
            {PAIN_LABEL[n.level]} · {n.name} · {fmtDayDate(n.date)}
          </Text>
        ))}
      </Card>

      {p.amrap.length > 0 && (
        <Card icon="flash-outline" title="Tus desafíos AMRAP">
          {p.amrap.map((a) => (
            <View key={a.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{a.name}</Text>
                <Text style={styles.rowDetail}>{a.times === 1 ? `Primera marca: ${a.last}` : `${a.first} → ${a.last}`}</Text>
              </View>
              {a.improved && <Ionicons name="trending-up" size={20} color={colors.accent} />}
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

function Card({ icon, title, children }: { icon: ComponentProps<typeof Ionicons>['name']; title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name={icon} size={18} color={colors.textMuted} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ExerciseRow({ e }: { e: ExerciseProgress }) {
  return (
    <Link href={{ pathname: '/exercise/[id]', params: { id: e.id } }} asChild>
      <Pressable accessibilityRole="link" style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{e.name}</Text>
          <Text style={styles.rowDetail}>
            {e.sessions === 1 ? `Primera marca: ${e.last}` : e.improved ? `${e.first} → ${e.last}` : `${e.last} · igual`}
          </Text>
        </View>
        {e.improved && <Ionicons name="trending-up" size={20} color={colors.accent} />}
      </Pressable>
    </Link>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: colors.text, ...display(26), textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  headlineCard: { borderWidth: 1, borderColor: colors.accent },
  headline: { color: colors.text, ...display(26) },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '700', flex: 1 },
  note: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  link: { color: colors.link, fontSize: 14, fontWeight: '700', paddingTop: spacing.xs },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 76 },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  barValue: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  bar: { alignSelf: 'stretch', borderRadius: 4, backgroundColor: colors.border },
  barEmpty: { backgroundColor: colors.surfaceAlt },
  barNow: { backgroundColor: colors.accent },
  steps: { flexDirection: 'row', gap: 4 },
  step: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt },
  stepDone: { backgroundColor: colors.accent },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { flexBasis: '46%', flexGrow: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowDetail: { color: colors.textMuted, fontSize: 14 },
  pain: { color: colors.warning, fontSize: 14 },
});
