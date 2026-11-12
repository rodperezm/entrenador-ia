import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import type { FinisherExercise, HiitOffer } from '@/domain/finisher';
import { buildTabata, fmtClock } from '@/domain/session';
import { isPerSide, weightLabel } from '@/domain/sides';
import { FinisherFeedback, type FinisherFeedbackResult } from '@/features/workout/FinisherFeedback';
import { FinisherExerciseCard, FinisherWhy } from '@/features/workout/FinisherGuide';
import type { useCues } from '@/features/workout/useCues';
import { useTrackRunner } from '@/features/workout/useTrackRunner';
import { colors, radius, spacing } from '@/theme';

export type HiitResult = FinisherFeedbackResult & { sets: { exercise: FinisherExercise; round: number }[] };

const PHASE_NAME = { prep: 'Prepárate', work: '¡Entrena!', rest: 'Descanso', roundRest: 'Descanso de ronda', cool: '' };

const exerciseText = (e: FinisherExercise) =>
  `${e.name}${e.weightKg ? ` · ${weightLabel(e.exerciseId, e.weightKg)}` : ''}`;

// Circuito del bloque C con el reloj del temporizador. Lo hecho se registra al terminar.
export function HiitBlock({
  offer,
  reason = null,
  cues,
  onFinish,
  onCancel,
  topInset,
  bottomInset,
}: {
  offer: HiitOffer;
  /** Por qué hoy toca este cierre. */
  reason?: string | null;
  cues: ReturnType<typeof useCues>;
  onFinish: (result: HiitResult) => void;
  onCancel: () => void;
  topInset: number;
  bottomInset: number;
}) {
  const { config, exercises } = offer;
  const phases = useMemo(() => buildTabata(config), [config]);
  const runner = useTrackRunner(phases);
  const { index, status, remainingSec } = runner;
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);

  const phase = phases[index];
  const atStart = phase.kind === 'work' && phase.round === 1 && phase.exercise === 1;
  useEffect(() => {
    if (status === 'running' && atStart) cues.say('¡Vamos!');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atStart, status === 'running']);

  useEffect(() => {
    if (status === 'done') cues.say('¡Lo lograste!');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const finishEarly = () => {
    setStoppedAt(index);
    runner.reset();
  };

  const ended = status === 'done' ? phases.length : stoppedAt;
  const completed =
    ended == null
      ? []
      : phases
          .slice(0, ended)
          .filter((p) => p.kind === 'work')
          .map((p) => ({ exercise: exercises[p.exercise! - 1], round: p.round! }));

  if (ended != null) {
    if (completed.length === 0) {
      return (
        <View style={[styles.screen, styles.end, { paddingTop: topInset + spacing.lg }]}>
          <Text style={styles.title}>Bloque sin registrar</Text>
          <Text style={styles.hint}>No alcanzaste a completar un ejercicio.</Text>
          <Button label="Volver" onPress={onCancel} />
        </View>
      );
    }
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.end, { paddingTop: topInset + spacing.lg, paddingBottom: bottomInset + 24 }]}
      >
        <Text style={styles.title}>Bloque C terminado 💪</Text>
        <Text style={styles.hint}>
          {completed.length === 1 ? '1 intervalo registrado' : `${completed.length} intervalos registrados`}. No cuentan
          para subir tus pesos.
        </Text>
        <FinisherFeedback
          exercises={[...new Set(completed.map((c) => c.exercise))]}
          onDone={(feedback) => onFinish({ ...feedback, sets: completed })}
        />
      </ScrollView>
    );
  }

  const current = phase.exercise ? exercises[phase.exercise - 1] : exercises[0];
  const upcoming =
    phase.kind === 'work'
      ? phases.slice(index + 1).find((p) => p.kind === 'work')
      : phases.slice(index).find((p) => p.kind === 'work');
  const nextExercise = upcoming ? exercises[upcoming.exercise! - 1] : null;
  const working = phase.kind === 'work';
  const idle = status === 'idle';
  const sideNote = working && isPerSide(current.exerciseId) ? 'Cambia de lado a la mitad.' : null;

  return (
    <View style={[styles.screen, { paddingTop: topInset + spacing.lg, paddingBottom: bottomInset + spacing.lg }]}>
      <Text style={styles.block}>Bloque C · HIIT</Text>
      {idle ? (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          <Text style={styles.title}>Tu circuito</Text>
          <Text style={styles.hint}>
            {config.rounds} rondas · {config.workSec} s de trabajo y {config.restSec} s de descanso · ≈ {offer.minutes}{' '}
            min
          </Text>
          <FinisherWhy reason={reason} exercises={exercises} />
          {exercises.map((e) => (
            <FinisherExerciseCard key={e.key} exercise={e} timed />
          ))}
          <Text style={styles.hint}>Si pierdes la técnica o algo duele, detente y termina el bloque.</Text>
        </ScrollView>
      ) : (
        <View style={[styles.stage, working && { backgroundColor: colors.accent }]}>
          <Text style={[styles.phase, working && { color: colors.onAccent }]}>
            {status === 'paused' ? 'En pausa' : PHASE_NAME[phase.kind]}
          </Text>
          <Text style={[styles.clock, working && { color: colors.onAccent }]}>{fmtClock(remainingSec)}</Text>
          {working && <Text style={[styles.now, { color: colors.onAccent }]}>{exerciseText(current)}</Text>}
          {sideNote && <Text style={[styles.round, { color: colors.onAccent }]}>{sideNote}</Text>}
          <Text style={[styles.round, working && { color: colors.onAccent }]}>
            Ronda {phase.round ?? 1} de {config.rounds}
          </Text>
        </View>
      )}
      {/* Al trabajar, la indicación del ejercicio en curso; al descansar, la del que viene. */}
      {!idle && (working ? current : nextExercise) && (
        <>
          <Text style={styles.hint}>{working ? 'Ahora' : 'A continuación'}</Text>
          <FinisherExerciseCard
            exercise={(working ? current : nextExercise)!}
            compact
            timed
            onBeforeTechnique={() => status === 'running' && runner.pause()}
          />
        </>
      )}
      <View style={styles.actions}>
        {idle ? (
          <>
            <Button label="Empezar circuito" onPress={runner.start} />
            <Button label="Volver" variant="ghost" onPress={onCancel} />
          </>
        ) : (
          <>
            <Button
              label={status === 'paused' ? 'Continuar' : 'Pausar'}
              onPress={status === 'paused' ? runner.resume : runner.pause}
            />
            <Button label="Terminar bloque" variant="ghost" onPress={finishEarly} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, gap: spacing.md },
  end: { paddingHorizontal: spacing.lg, gap: spacing.md },
  block: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  list: { flex: 1 },
  listContent: { gap: spacing.md, paddingBottom: spacing.md },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  phase: { color: colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  clock: { color: colors.text, fontSize: 88, fontWeight: '900', fontVariant: ['tabular-nums'] },
  now: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  round: { color: colors.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  actions: { gap: spacing.sm },
});
