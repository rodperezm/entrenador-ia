import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BodyMap, bestSide } from '@/components/BodyMap';
import { Button } from '@/components/ui';
import { EXERCISES_BY_ID } from '@/data/exercises.seed';
import { QUICK_ROUTINES, ROUTINE_PREP_SEC, type RoutineStep, routineMinutes, routineSteps } from '@/domain/quickRoutines';
import { ROUTINE_ICONS, ROUTINE_TONES } from '@/features/routines/tones';
import { useCues } from '@/features/workout/useCues';
import { useStayAwake } from '@/lib/useStayAwake';
import { colors, display, radius, spacing } from '@/theme';

// Una rutina rápida: primero la lista de lo que trae y, al empezar, una guía paso a paso con
// cuenta regresiva. No se guarda en el historial: es un rato de movilidad, no una sesión del plan.

export default function RoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const routine = QUICK_ROUTINES.find((r) => r.id === id);
  const [running, setRunning] = useState(false);

  if (!routine) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.note}>No encontramos esa rutina.</Text>
        <Button label="Volver" onPress={() => router.back()} />
      </View>
    );
  }

  const steps = routineSteps(routine, EXERCISES_BY_ID);
  const tone = ROUTINE_TONES[routine.tone];

  if (running) return <Runner steps={steps} vivid={routine.tone === 'accent' ? colors.accent : tone.vivid} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '' }} />
      <View style={[styles.hero, { backgroundColor: tone.bg }]}>
        <Ionicons name={ROUTINE_ICONS[routine.id] ?? 'body-outline'} size={30} color={tone.vivid} />
        <Text style={[styles.heroTitle, { color: tone.text }]}>{routine.title}</Text>
        <Text style={[styles.heroMeta, { color: tone.sub }]}>
          {routine.zone} · {steps.length} ejercicios · {routineMinutes(steps)} min
        </Text>
      </View>

      {routine.caution ? (
        <View style={styles.caution}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
          <Text style={styles.cautionText}>{routine.caution}</Text>
        </View>
      ) : null}

      <Button label="Empezar" onPress={() => setRunning(true)} />
      <Text style={styles.note}>
        Te guiamos ejercicio por ejercicio, con cuenta regresiva y sonido. Estira hasta sentir tensión, nunca dolor, y
        respira con calma.
      </Text>

      {steps.map((s, i) => (
        <Link key={s.exercise.id} href={{ pathname: '/exercise/[id]', params: { id: s.exercise.id } }} asChild>
          <Pressable accessibilityRole="link" style={styles.stepRow}>
            <Text style={[styles.stepNo, { color: routine.tone === 'accent' ? colors.accent : tone.vivid }]}>{i + 1}</Text>
            <View style={styles.stepText}>
              <Text style={styles.stepName}>{s.exercise.name.es}</Text>
              <Text style={styles.stepLabel}>{s.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

type Run = { i: number; stage: 'prep' | 'work' | 'done'; left: number };

// Un segundo menos; al llegar a cero pasa de «prepárate» al ejercicio, y de ahí al paso siguiente.
function tick(s: Run, steps: RoutineStep[]): Run {
  if (s.stage === 'done') return s;
  if (s.left > 1) return { ...s, left: s.left - 1 };
  if (s.stage === 'prep') return { i: s.i, stage: 'work', left: steps[s.i].seconds };
  return next(s, steps);
}
const next = (s: Run, steps: RoutineStep[]): Run =>
  s.i + 1 < steps.length ? { i: s.i + 1, stage: 'prep', left: ROUTINE_PREP_SEC } : { i: s.i, stage: 'done', left: 0 };

function Runner({ steps, vivid }: { steps: RoutineStep[]; vivid: string }) {
  useStayAwake('routine');
  const { play } = useCues(true);
  const [run, setRun] = useState<Run>({ i: 0, stage: 'prep', left: ROUTINE_PREP_SEC });
  const [paused, setPaused] = useState(false);
  const step = steps[run.i];
  const half = step.sides === 2 ? step.seconds / 2 : 0;

  useEffect(() => {
    if (paused || run.stage === 'done') return;
    const timer = setInterval(() => setRun((s) => tick(s, steps)), 1000);
    return () => clearInterval(timer);
  }, [paused, run.stage, steps]);

  // Sonidos: al empezar el ejercicio, al cambiar de lado, en los últimos 3 segundos y al terminar.
  useEffect(() => {
    if (run.stage === 'done') play('done');
    else if (run.stage === 'work' && run.left === step.seconds) play('work');
    else if (run.stage === 'work' && half && run.left === half) play('rest');
    else if (run.left <= 3) play('count');
  }, [run, step, half, play]);

  if (run.stage === 'done') {
    return (
      <View style={[styles.screen, styles.center]} testID="routine-done">
        <Stack.Screen options={{ title: '' }} />
        <Ionicons name="checkmark-circle" size={64} color={colors.good} />
        <Text style={styles.doneTitle}>Rutina completa</Text>
        <Text style={[styles.note, styles.centerText]}>Bien hecho. Tu cuerpo agradece estos minutos.</Text>
        <Button label="Volver a Ejercicios" onPress={() => router.back()} />
      </View>
    );
  }

  const prep = run.stage === 'prep';
  const status = prep
    ? run.i === 0
      ? 'Prepárate'
      : 'Acomódate para el siguiente'
    : half
      ? run.left > half
        ? 'Primer lado'
        : 'Cambia de lado'
      : step.exercise.prescription.mode === 'reps'
        ? 'A ritmo tranquilo'
        : 'Mantén y respira';
  const cue = step.exercise.instructions.keyCues[0]?.es ?? step.exercise.instructions.steps[0]?.text.es;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.runContent}>
      <Stack.Screen options={{ title: '' }} />
      <View style={styles.progress} accessibilityLabel={`Paso ${run.i + 1} de ${steps.length}`}>
        {steps.map((s, i) => (
          <View key={s.exercise.id} style={[styles.progressBit, i <= run.i && { backgroundColor: vivid }]} />
        ))}
      </View>
      <Text style={styles.stepCount}>
        Paso {run.i + 1} de {steps.length}
      </Text>

      <View style={styles.figure}>
        <BodyMap
          primary={step.exercise.anatomy.primary}
          secondary={step.exercise.anatomy.secondary}
          views={[bestSide(step.exercise.anatomy.primary, step.exercise.anatomy.secondary)]}
          height={170}
        />
      </View>
      <Text style={styles.runName} testID="routine-step-name">
        {step.exercise.name.es}
      </Text>
      <Text style={styles.stepLabel}>{step.label}</Text>

      <Text style={[styles.status, { color: prep ? colors.textMuted : vivid }]}>{status}</Text>
      <Text style={[styles.clock, prep && { color: colors.textMuted }]} testID="routine-clock">
        {run.left}
      </Text>
      {cue ? <Text style={[styles.note, styles.centerText]}>{cue}</Text> : null}

      <View style={styles.controls}>
        <View style={styles.control}>
          <Button label={paused ? 'Seguir' : 'Pausar'} variant="secondary" onPress={() => setPaused(!paused)} />
        </View>
        <View style={styles.control}>
          <Button
            label={run.i + 1 < steps.length ? 'Siguiente' : 'Terminar'}
            onPress={() => setRun((s) => (s.stage === 'prep' ? tick({ ...s, left: 1 }, steps) : next(s, steps)))}
          />
        </View>
      </View>
      <Link href={{ pathname: '/exercise/[id]', params: { id: step.exercise.id } }} asChild>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => setPaused(true)}>
          <Text style={styles.link}>Ver cómo se hace</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  centerText: { textAlign: 'center' },
  note: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  link: { color: colors.link, fontSize: 15, fontWeight: '700', textAlign: 'center', paddingVertical: spacing.sm },

  hero: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
  heroTitle: { ...display(36) },
  heroMeta: { fontSize: 14, fontWeight: '600' },
  caution: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cautionText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  stepNo: { ...display(28), width: 24, textAlign: 'center' },
  stepText: { flex: 1, gap: 2 },
  stepName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  stepLabel: { color: colors.textMuted, fontSize: 14, textAlign: 'left' },

  runContent: { padding: spacing.lg, gap: spacing.sm, alignItems: 'center', paddingBottom: 40 },
  progress: { flexDirection: 'row', gap: 4, alignSelf: 'stretch' },
  progressBit: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt },
  stepCount: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  figure: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.sm },
  runName: { color: colors.text, ...display(30), textAlign: 'center', marginTop: spacing.sm },
  status: { fontSize: 16, fontWeight: '800', marginTop: spacing.md },
  clock: { color: colors.text, ...display(96) },
  controls: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch', marginTop: spacing.md },
  control: { flex: 1 },
  doneTitle: { color: colors.text, ...display(34) },
});
