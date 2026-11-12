import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BodyMap, bestSide } from '@/components/BodyMap';
import { EXERCISES_BY_ID } from '@/data/exercises.seed';
import { type FinisherExercise, finisherWork } from '@/domain/finisher';
import { weightLabel } from '@/domain/sides';
import { strengthInfo } from '@/domain/strength';
import { useHistory } from '@/state/history';
import { colors, radius, spacing } from '@/theme';

// HIIT y AMRAP se guían igual que el resto del entrenamiento: cada ejercicio con su mapa muscular,
// sus indicaciones clave, la técnica a un toque y de dónde salió (tu rutina o agregado).

// Los ejercicios que el circuito suma para completarse llevan esta clave (ver domain/finisher).
export const isAddedToCircuit = (e: FinisherExercise) => e.key.startsWith('finisher-');

// Qué es el bloque y por qué hoy, en dos líneas.
export function FinisherWhy({ reason, exercises }: { reason: string | null; exercises: FinisherExercise[] }) {
  const added = exercises.filter(isAddedToCircuit).length;
  return (
    <View style={styles.why}>
      {reason && <Text style={styles.whyText}>{reason}</Text>}
      <Text style={styles.whyText}>
        Reemplaza tu bloque C de hoy y no cambia tus pesos.
        {added > 0 &&
          ` Para armar el circuito sumamos ${added === 1 ? 'un ejercicio' : `${added} ejercicios`} de otro movimiento, más liviano${added === 1 ? '' : 's'} y fácil${added === 1 ? '' : 'es'} de ejecutar.`}
      </Text>
    </View>
  );
}

export function FinisherExerciseCard({
  exercise,
  compact = false,
  timed = false,
  onBeforeTechnique,
}: {
  exercise: FinisherExercise;
  /** Durante el bloque: una sola indicación y sin mapa, para que se lea de un vistazo. */
  compact?: boolean;
  /** HIIT: se trabaja por tiempo, así que no se muestran repeticiones, solo el peso. */
  timed?: boolean;
  /** Antes de abrir la técnica (por ejemplo, pausar el reloj). */
  onBeforeTechnique?: () => void;
}) {
  const { sessions } = useHistory();
  const ex = EXERCISES_BY_ID.get(exercise.exerciseId);
  const added = isAddedToCircuit(exercise);
  const isNew = !sessions.some((s) => s.sets.some((l) => l.exerciseId === exercise.exerciseId));
  const cues = ex?.instructions.keyCues.slice(0, compact ? 1 : 2) ?? [];
  const works = ex ? strengthInfo(ex) : '';
  const openTechnique = () => {
    onBeforeTechnique?.();
    router.push({ pathname: '/exercise/[id]', params: { id: exercise.exerciseId } });
  };

  return (
    <View style={styles.card}>
      {!compact && ex && (
        <BodyMap
          primary={ex.anatomy.primary}
          secondary={ex.anatomy.secondary}
          views={[bestSide(ex.anatomy.primary, ex.anatomy.secondary)]}
          height={96}
        />
      )}
      <View style={styles.body}>
        <Text style={styles.name}>{exercise.name}</Text>
        {(() => {
          const weight = exercise.weightKg ? weightLabel(exercise.exerciseId, exercise.weightKg) : null;
          const work = timed ? weight : [finisherWork(exercise), weight].filter(Boolean).join(' · ');
          return work ? <Text style={styles.work}>{work}</Text> : null;
        })()}
        {!compact && (
          <Text style={[styles.tag, added && styles.tagAdded]}>
            {added ? `Agregado para completar el circuito${works ? ` · ${works}` : ''}` : 'De tu rutina de hoy'}
          </Text>
        )}
        {isNew && !compact && <Text style={styles.newTag}>Nuevo para ti: mira la técnica antes de empezar</Text>}
        {cues.map((c, i) => (
          <Text key={i} style={styles.cue}>
            • {c.es}
          </Text>
        ))}
        <Pressable onPress={openTechnique} hitSlop={8}>
          <Text style={styles.link}>Ver técnica</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  why: { gap: 4 },
  whyText: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  body: { flex: 1, gap: 3 },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  work: { color: colors.textMuted, fontSize: 14 },
  tag: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  tagAdded: { color: colors.warning },
  newTag: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  cue: { color: colors.text, fontSize: 13, lineHeight: 18 },
  link: { color: colors.link, fontSize: 14, fontWeight: '700', marginTop: 2 },
});
