import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BodyMap } from '@/components/BodyMap';
import { EXERCISES_BY_ID } from '@/data/exercises.seed';
import { EQUIPMENT, MUSCLES, RESTRICTION_FLAGS } from '@/domain/catalog';
import { BLOCK_LABELS, GRIP_LABELS } from '@/domain/labels';
import type { Exercise } from '@/domain/schema';
import { colors, radius, spacing } from '@/theme';

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = EXERCISES_BY_ID.get(id);

  if (!e) {
    return (
      <View style={styles.screen}>
        <Text style={styles.body}>Ejercicio no encontrado.</Text>
      </View>
    );
  }

  const kb = e.kettlebellGuide;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: e.name.es }} />

      {/* Video: espacio reservado hasta que lleguen los videos de Gymvisual */}
      <View style={styles.hero}>
        <Ionicons name="play-circle-outline" size={36} color={colors.textMuted} />
        <Text style={styles.heroText}>{e.media.provider ? 'Video en camino' : 'Video por definir'}</Text>
        <Text style={styles.heroSub}>
          {e.media.provider
            ? `Gymvisual · ${e.media.provider.id} · estilo gris`
            : 'Ejercicio nuevo: consultando video con el proveedor'}
        </Text>
      </View>

      <Text style={styles.title}>{e.name.es}</Text>
      <Text style={styles.body}>{e.description.es}</Text>
      <Text style={styles.meta}>
        {e.blockTypes.map((b) => BLOCK_LABELS[b]).join(' · ')} · Nivel {e.complexityLevel} ·{' '}
        {[
          ...e.equipment.required.map((q) => EQUIPMENT[q]),
          ...e.equipment.optional.map((q) => `${EQUIPMENT[q]} (opcional)`),
        ].join(', ') || 'Sin equipamiento'}
      </Text>

      <View style={styles.statsRow}>
        <Stat label="Series" value={String(e.prescription.sets)} />
        <Stat
          label={e.prescription.mode === 'time' ? 'Tiempo' : 'Reps'}
          value={
            e.prescription.mode === 'time'
              ? `${e.prescription.durationSec}s`
              : `${e.prescription.repRange?.min}–${e.prescription.repRange?.max}`
          }
        />
        <Stat label="Descanso" value={`${e.prescription.restSec}s`} />
      </View>

      <Section title="Músculos trabajados">
        <View style={styles.mapBox}>
          <BodyMap primary={e.anatomy.primary} secondary={e.anatomy.secondary} height={280} showLabels />
        </View>
        <MuscleList title="Principales" items={e.anatomy.primary} strong />
        {e.anatomy.secondary.length > 0 && <MuscleList title="Secundarios" items={e.anatomy.secondary} />}
      </Section>

      <Section title="Paso a paso">
        {e.instructions.steps.map((s) => (
          <View key={s.order} style={styles.step}>
            <Text style={styles.stepNum}>{s.order}</Text>
            <Text style={[styles.body, { flex: 1 }]}>{s.text.es}</Text>
          </View>
        ))}
        {e.instructions.breathing && <Text style={styles.note}>Respiración: {e.instructions.breathing.es}</Text>}
      </Section>

      {e.instructions.keyCues.length > 0 && (
        <Section title="Puntos clave">
          {e.instructions.keyCues.map((c, i) => (
            <Bullet key={i} text={c.es} />
          ))}
        </Section>
      )}

      {e.instructions.commonMistakes.length > 0 && (
        <Section title="Errores comunes">
          {e.instructions.commonMistakes.map((c, i) => (
            <Bullet key={i} text={c.es} color={colors.warning} />
          ))}
        </Section>
      )}

      {kb && (
        <Section title="Guía técnica de kettlebell">
          <View style={styles.kbCard}>
            <Text style={styles.kbLabel}>Agarre</Text>
            <Text style={styles.body}>{GRIP_LABELS[kb.grip]}</Text>
            <Text style={styles.kbLabel}>Posición inicial</Text>
            <Text style={styles.body}>{kb.startPosition.es}</Text>
            {kb.hipHinge && (
              <>
                <Text style={styles.kbLabel}>Bisagra de cadera</Text>
                {kb.hipHinge.cues.map((c, i) => (
                  <Bullet key={i} text={c.es} />
                ))}
                {kb.hipHinge.drillExerciseId && (
                  <ExerciseLink id={kb.hipHinge.drillExerciseId} prefix="Practica primero: " />
                )}
              </>
            )}
            <Text style={styles.kbLabel}>Seguridad lumbar</Text>
            {kb.lumbarSafety.map((c, i) => (
              <Bullet key={i} text={c.es} color={colors.accent} />
            ))}
            <Text style={styles.kbLabel}>Peso sugerido para empezar</Text>
            <Text style={styles.body}>
              Principiante {kb.suggestedWeightKg.beginner} kg · Intermedio {kb.suggestedWeightKg.intermediate} kg ·
              Avanzado {kb.suggestedWeightKg.advanced} kg
            </Text>
          </View>
        </Section>
      )}

      {e.safetyNotes.length > 0 && (
        <Section title="Si tienes alguna restricción">
          {e.safetyNotes.map((n) => (
            <View key={n.flag} style={styles.warnCard}>
              <Text style={styles.warnTitle}>{RESTRICTION_FLAGS[n.flag]}</Text>
              <Text style={styles.body}>{n.note.es}</Text>
            </View>
          ))}
        </Section>
      )}

      <Progression e={e} />

      {e.cooldownStretchIds.length > 0 && (
        <Section title="Elongación recomendada">
          {e.cooldownStretchIds.map((id) => (
            <ExerciseLink key={id} id={id} />
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Progression({ e }: { e: Exercise }) {
  const { previous, next } = e.progression;
  if (!previous.length && !next.length) return null;
  return (
    <Section title="Progresión">
      {previous.map((id) => (
        <ExerciseLink key={id} id={id} prefix="← Más fácil: " />
      ))}
      {next.map((id) => (
        <ExerciseLink key={id} id={id} prefix="Más difícil: " suffix=" →" />
      ))}
    </Section>
  );
}

function ExerciseLink({ id, prefix = '', suffix = '' }: { id: string; prefix?: string; suffix?: string }) {
  const target = EXERCISES_BY_ID.get(id);
  if (!target) return null;
  return (
    <Link href={{ pathname: '/exercise/[id]', params: { id } }} style={styles.link}>
      {prefix}
      {target.name.es}
      {suffix}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Bullet({ text, color = colors.textMuted }: { text: string; color?: string }) {
  return (
    <View style={styles.bullet}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

function MuscleList({
  title,
  items,
  strong,
}: {
  title: string;
  items: Exercise['anatomy']['primary'];
  strong?: boolean;
}) {
  return (
    <Text style={styles.meta}>
      <Text style={{ color: strong ? colors.accent : colors.text, fontWeight: '700' }}>{title}: </Text>
      {items.map((m) => MUSCLES[m.muscle].label).join(', ')}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  hero: {
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  heroText: { color: colors.textMuted, fontWeight: '700' },
  heroSub: { color: colors.border, fontSize: 11 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  meta: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  note: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 12 },
  section: { gap: spacing.sm, marginTop: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  mapBox: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.lg },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '800',
    overflow: 'hidden',
  },
  bullet: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  kbCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  kbLabel: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  warnCard: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    gap: 2,
  },
  warnTitle: { color: colors.warning, fontWeight: '700' },
  link: { color: colors.accent, fontSize: 15, fontWeight: '600', paddingVertical: 4 },
});
