import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { EFFORT_OPTIONS } from '@/domain/effort';
import type { FinisherExercise } from '@/domain/finisher';
import type { PainLevel, PainSide } from '@/domain/schema';
import { isPerSide } from '@/domain/sides';
import { PainPicker, SidePicker } from '@/features/workout/PainControls';
import { colors, radius } from '@/theme';

export type FinisherFeedbackResult = {
  rpe: number | null;
  pain: PainLevel | null;
  painExerciseId: string | null;
  painSide: PainSide | null;
};

// Esfuerzo y dolor al terminar un cierre HIIT o AMRAP.
export function FinisherFeedback({
  exercises,
  onDone,
}: {
  exercises: FinisherExercise[];
  onDone: (result: FinisherFeedbackResult) => void;
}) {
  const [rpe, setRpe] = useState<number | null>(null);
  const [painOpen, setPainOpen] = useState(false);
  const [pain, setPain] = useState<PainLevel | null>(null);
  const [painExerciseId, setPainExerciseId] = useState<string | null>(null);
  const [painSide, setPainSide] = useState<PainSide | null>(null);
  const hurts = (pain ?? 0) > 0;

  return (
    <>
      <Text style={styles.label}>¿Cuánto más podías aguantar?</Text>
      <View style={styles.chips}>
        {EFFORT_OPTIONS.hold.map((o) => (
          <Pressable
            key={o.rpe}
            onPress={() => setRpe(rpe === o.rpe ? null : o.rpe)}
            style={[styles.chip, rpe === o.rpe && styles.chipOn]}
          >
            <Text style={[styles.chipText, rpe === o.rpe && { color: colors.onAccent }]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      <PainPicker open={painOpen} onOpen={() => setPainOpen(true)} pain={pain} onPain={setPain} />
      {hurts && (
        <>
          <Text style={styles.label}>¿En cuál ejercicio?</Text>
          <View style={styles.chips}>
            {exercises.map((e) => (
              <Pressable
                key={e.key}
                onPress={() => setPainExerciseId(e.exerciseId)}
                style={[styles.chip, painExerciseId === e.exerciseId && styles.painOn]}
              >
                <Text style={[styles.chipText, painExerciseId === e.exerciseId && { color: colors.bg }]}>{e.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {hurts && painExerciseId && isPerSide(painExerciseId) && <SidePicker side={painSide} onSide={setPainSide} />}
      <Button
        label="Continuar"
        disabled={hurts && !painExerciseId}
        onPress={() => onDone({ rpe, pain, painExerciseId, painSide })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  chipOn: { backgroundColor: colors.accent },
  painOn: { backgroundColor: colors.warning },
  chipText: { color: colors.text, fontWeight: '700' },
});
