import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Stepper } from '@/components/ui';
import { type AmrapMark, type AmrapOffer, markLabel, markScore } from '@/domain/finisher';
import { fmtClock, type Phase } from '@/domain/session';
import { FinisherFeedback, type FinisherFeedbackResult } from '@/features/workout/FinisherFeedback';
import { FinisherExerciseCard, FinisherWhy } from '@/features/workout/FinisherGuide';
import type { useCues } from '@/features/workout/useCues';
import { useTrackRunner } from '@/features/workout/useTrackRunner';
import { colors, radius, spacing } from '@/theme';

export type AmrapResult = FinisherFeedbackResult & AmrapMark;

const PREP_SEC = 10;
const MAX_EXTRA_REPS = 40;

// Desafío AMRAP: tantas rondas como se pueda en el tiempo, descansando cuando haga falta.
export function AmrapBlock({
  offer,
  reason = null,
  cues,
  onFinish,
  onCancel,
  topInset,
  bottomInset,
}: {
  offer: AmrapOffer;
  /** Por qué hoy toca este cierre. */
  reason?: string | null;
  cues: ReturnType<typeof useCues>;
  onFinish: (result: AmrapResult) => void;
  onCancel: () => void;
  topInset: number;
  bottomInset: number;
}) {
  const { exercises, minutes, previous } = offer;
  const phases = useMemo<Phase[]>(
    () => [
      { kind: 'prep', durationSec: PREP_SEC },
      { kind: 'work', durationSec: minutes * 60, round: 1, exercise: 1, quiet: true },
    ],
    [minutes],
  );
  const runner = useTrackRunner(phases);
  const { index, status, remainingSec } = runner;
  const [rounds, setRounds] = useState(0);
  const [extraReps, setExtraReps] = useState(0);
  const [stopped, setStopped] = useState(false);

  const working = phases[index].kind === 'work';
  useEffect(() => {
    if (status === 'running' && working) cues.say('¡Vamos!');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working, status === 'running']);

  useEffect(() => {
    if (status === 'done') cues.say('¡Lo lograste!');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const finishEarly = () => {
    setStopped(true);
    runner.reset();
  };

  // Antes de empezar, cada ejercicio completo; durante el desafío, una indicación para leer de un vistazo.
  const list = (compact: boolean) =>
    exercises.map((e) => (
      <FinisherExerciseCard
        key={e.key}
        exercise={e}
        compact={compact}
        onBeforeTechnique={() => status === 'running' && runner.pause()}
      />
    ));

  if (status === 'done' || stopped) {
    const mark = { rounds, extraReps };
    const beat = previous && markScore(mark) > markScore(previous);
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.end, { paddingTop: topInset + spacing.lg, paddingBottom: bottomInset + 24 }]}
      >
        <Text style={styles.title}>{beat ? '¡Nueva marca! 🏆' : 'Desafío terminado 💪'}</Text>
        <Text style={styles.score}>{markLabel(mark)}</Text>
        {previous && <Text style={styles.hint}>Tu marca anterior: {markLabel(previous)}</Text>}
        <View style={styles.extra}>
          <Text style={styles.label}>Repeticiones de la ronda incompleta</Text>
          <Stepper value={extraReps} min={0} max={MAX_EXTRA_REPS} onChange={setExtraReps} />
        </View>
        <Text style={styles.hint}>Tu resultado no cambia tus pesos: sirve para compararte contigo.</Text>
        {rounds === 0 && extraReps === 0 ? (
          <Button label="Volver sin registrar" variant="ghost" onPress={onCancel} />
        ) : (
          <FinisherFeedback exercises={exercises} onDone={(feedback) => onFinish({ ...feedback, ...mark })} />
        )}
      </ScrollView>
    );
  }

  if (status === 'idle') {
    return (
      <View style={[styles.screen, { paddingTop: topInset + spacing.lg, paddingBottom: bottomInset + spacing.lg }]}>
        <Text style={styles.block}>Bloque C · AMRAP</Text>
        <ScrollView contentContainerStyle={styles.intro}>
          <Text style={styles.title}>{minutes} minutos</Text>
          <Text style={styles.hint}>Completa todas las rondas que puedas, en orden. Descansa cuando lo necesites.</Text>
          <FinisherWhy reason={reason} exercises={exercises} />
          {list(false)}
          {previous && <Text style={styles.record}>Tu marca: {markLabel(previous)}. ¿La superas?</Text>}
          <Text style={styles.hint}>Si pierdes la técnica, descansa. Si algo duele, detente.</Text>
        </ScrollView>
        <View style={styles.actions}>
          <Button label="Empezar desafío" onPress={runner.start} />
          <Button label="Volver" variant="ghost" onPress={onCancel} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.end, { paddingTop: topInset + spacing.lg, paddingBottom: bottomInset + 24 }]}
    >
      <Text style={styles.block}>Bloque C · AMRAP</Text>
      <View style={[styles.stage, working && status === 'running' && { backgroundColor: colors.accent }]}>
        <Text style={[styles.phase, working && status === 'running' && { color: colors.onAccent }]}>
          {status === 'paused' ? 'En pausa' : working ? 'Rondas: ' + rounds : 'Prepárate'}
        </Text>
        <Text style={[styles.clock, working && status === 'running' && { color: colors.onAccent }]}>
          {fmtClock(remainingSec)}
        </Text>
      </View>
      {list(true)}
      {working && (
        <View style={styles.counter}>
          <Pressable
            onPress={() => setRounds((r) => Math.max(0, r - 1))}
            style={styles.minus}
            accessibilityLabel="Restar una ronda"
          >
            <Text style={styles.minusText}>−1</Text>
          </Pressable>
          <Pressable onPress={() => setRounds((r) => r + 1)} style={styles.plus} accessibilityLabel="Sumar una ronda">
            <Text style={styles.plusText}>+1 ronda</Text>
          </Pressable>
        </View>
      )}
      {previous && <Text style={styles.hint}>Tu marca: {markLabel(previous)}</Text>}
      <Button
        label={status === 'paused' ? 'Continuar' : 'Pausar'}
        variant="secondary"
        onPress={status === 'paused' ? runner.resume : runner.pause}
      />
      <Button label="Terminar desafío" variant="ghost" onPress={finishEarly} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, gap: spacing.md },
  end: { gap: spacing.md },
  intro: { gap: spacing.md, paddingBottom: spacing.md },
  block: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  score: { color: colors.accent, fontSize: 34, fontWeight: '900' },
  record: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  label: { color: colors.textMuted, fontSize: 14, fontWeight: '600', flex: 1 },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  extra: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stage: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  phase: { color: colors.text, fontSize: 22, fontWeight: '900' },
  clock: { color: colors.text, fontSize: 72, fontWeight: '900', fontVariant: ['tabular-nums'] },
  counter: { flexDirection: 'row', gap: spacing.sm },
  minus: {
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minusText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  plus: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  plusText: { color: colors.onAccent, fontSize: 20, fontWeight: '900' },
  actions: { gap: spacing.sm },
});
