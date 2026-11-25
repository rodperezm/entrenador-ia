import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Fragment } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LADDER_CARDS, LADDER_RULES, LADDER_STAGES, ladderEarnText } from '@/content/ladderGuide';
import { cycleInfo } from '@/domain/cycle';
import { LADDER } from '@/domain/ladder';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, display, radius, spacing } from '@/theme';

// «Tu camino con la kettlebell»: los 15 pasos de la fila técnica, con el paso de la persona destacado.
// Se abre desde Progreso, desde la ficha de cada ejercicio de la fila y desde el aviso de Hoy.
export default function LadderScreen() {
  const { profile } = useProfile();
  const { week } = usePlan();
  const { sessions } = useHistory();
  const step = profile ? cycleInfo(sessions, profile, week.days).stage : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        15 pasos, de la bisagra al snatch. Avanzas cuando dominas la técnica de cada uno, a tu ritmo y sin
        saltarte ninguno.
      </Text>
      {step != null && (
        <View style={styles.youAre}>
          <Text style={styles.youAreText}>
            Vas en el paso {step} de {LADDER.length}: {LADDER[step - 1].name}
          </Text>
        </View>
      )}

      {LADDER.map((s, i) => {
        const n = i + 1;
        const stage = LADDER_STAGES.find((x) => x.from === n);
        const card = LADDER_CARDS[i];
        const done = step != null && n < step;
        const current = step === n;
        return (
          <Fragment key={s.name}>
            {stage && <Text style={styles.stage}>{stage.name}</Text>}
            <View style={[styles.card, current && styles.cardCurrent, step != null && n > step && styles.cardAhead]}>
              <View style={styles.cardHead}>
                <View style={[styles.badge, (done || current) && styles.badgeOn]}>
                  {done ? (
                    <Ionicons name="checkmark" size={18} color={colors.onAccent} />
                  ) : (
                    <Text style={[styles.badgeText, current && { color: colors.onAccent }]}>{n}</Text>
                  )}
                </View>
                <View style={styles.cardTitle}>
                  <Text style={styles.name}>{s.name}</Text>
                  {current && <Text style={styles.tag}>Tu paso</Text>}
                </View>
              </View>
              <Text style={styles.body}>
                <Text style={styles.label}>Para qué: </Text>
                {card.purpose}
              </Text>
              <Text style={styles.body}>
                <Text style={styles.label}>Clave: </Text>
                {card.cue}
              </Text>
              <Text style={styles.body}>
                <Text style={styles.label}>{n === LADDER.length ? 'Al final: ' : 'Siguiente paso: '}</Text>
                {ladderEarnText(n)}
              </Text>
              <Link href={{ pathname: '/exercise/[id]', params: { id: s.ids[0] } }} style={styles.link}>
                Ver el ejercicio y su video ›
              </Link>
            </View>
          </Fragment>
        );
      })}

      <View style={styles.rules}>
        {LADDER_RULES.map((r) => (
          <Text key={r} style={styles.body}>
            {r}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  lead: { color: colors.text, fontSize: 16, lineHeight: 23 },
  youAre: { backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md },
  youAreText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  stage: { color: colors.accent, ...display(24), marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 6 },
  cardCurrent: { borderWidth: 2, borderColor: colors.accent },
  cardAhead: { opacity: 0.75 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOn: { backgroundColor: colors.accent },
  badgeText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  name: { color: colors.text, fontSize: 17, fontWeight: '800' },
  tag: {
    color: colors.onAccent,
    backgroundColor: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  label: { color: colors.text, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  link: { color: colors.link, fontSize: 14, fontWeight: '700', marginTop: 2 },
  rules: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
});
