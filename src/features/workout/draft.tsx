import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { type RefObject, useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { DAY_LONG } from '@/domain/week';
import { canResume, parseDraft, sessionFromDraft, type WorkoutDraft } from '@/domain/workoutDraft';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { colors, display, radius, spacing } from '@/theme';

// El entrenamiento en curso se guarda en el teléfono tras cada serie. Si el sistema cierra la
// app a mitad de la sesión, al volver se ofrece retomarlo, guardar lo hecho o descartarlo.

const DRAFT_KEY = 'workout-draft.v1';

// undefined = aún no se lee del teléfono.
let current: WorkoutDraft | null | undefined;
const listeners = new Set<() => void>();
const set = (d: WorkoutDraft | null) => {
  current = d;
  listeners.forEach((l) => l());
};

let loading: Promise<void> | null = null;
const ensureLoaded = () =>
  (loading ??= AsyncStorage.getItem(DRAFT_KEY)
    .then((raw) => {
      // Lo guardado en esta misma apertura manda sobre lo leído.
      if (current === undefined) set(parseDraft(raw));
    })
    .catch(() => {
      if (current === undefined) set(null);
    }));

export function saveDraft(d: WorkoutDraft) {
  set(d);
  AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(d)).catch(() => {});
}

export function clearDraft() {
  set(null);
  AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
}

// El borrador guardado: undefined mientras se lee, null si no hay.
export function useWorkoutDraft() {
  useEffect(() => {
    ensureLoaded();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

type Snapshot = Omit<WorkoutDraft, 'savedAt' | 'cantDo' | 'amrap' | 'markTimes'>;

// Va dentro de la pantalla de entrenamiento: guarda cada vez que cambia lo registrado.
// Las referencias traen lo que la pantalla lleva fuera del estado (se leen al guardar).
export function DraftSaver({
  snapshot,
  cantDo,
  amrap,
  markTimes,
}: {
  snapshot: Snapshot;
  cantDo: RefObject<WorkoutDraft['cantDo']>;
  amrap: RefObject<WorkoutDraft['amrap']>;
  markTimes: RefObject<number[]>;
}) {
  const json = JSON.stringify(snapshot);
  useEffect(() => {
    const base = JSON.parse(json) as Snapshot;
    if (!base.logs.length) return;
    saveDraft({
      ...base,
      savedAt: Date.now(),
      cantDo: cantDo.current ?? undefined,
      amrap: amrap.current ?? undefined,
      markTimes: markTimes.current ?? [],
    });
  }, [json, cantDo, amrap, markTimes]);
  return null;
}

const setsLabel = (n: number) => `${n} ${n === 1 ? 'serie registrada' : 'series registradas'}`;

// En Hoy: aviso de que quedó un entrenamiento sin terminar.
export function UnfinishedWorkoutCard() {
  const draft = useWorkoutDraft();
  const { plan } = usePlan();
  const { addSession } = useHistory();
  const [now] = useState(() => Date.now());
  if (!draft || !draft.logs.length) return null;

  const resumable = canResume(draft, { day: draft.day, planGeneratedAt: plan?.generatedAt ?? null, now });
  const keep = () => {
    addSession(sessionFromDraft(draft));
    clearDraft();
  };
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Tienes un entrenamiento sin terminar</Text>
      <Text style={styles.text}>
        {DAY_LONG[draft.day]} · {setsLabel(draft.logs.length)}.{' '}
        {resumable
          ? 'Puedes seguir donde quedaste.'
          : 'Ya no se puede retomar (cambió la rutina o pasó mucho tiempo), pero puedes guardar lo que hiciste.'}
      </Text>
      {resumable ? (
        <Button
          label="Retomar"
          onPress={() => router.push({ pathname: '/workout/[day]', params: { day: draft.day } })}
        />
      ) : (
        <Button label="Guardar lo que hice" onPress={keep} />
      )}
      <Button label="Descartarlo" variant="ghost" onPress={clearDraft} />
    </View>
  );
}

// Al abrir un entrenamiento habiendo uno sin terminar.
export function ResumePrompt({
  draft,
  resumable,
  insetTop,
  onResume,
  onKeep,
  onDiscard,
}: {
  draft: WorkoutDraft;
  resumable: boolean;
  insetTop: number;
  onResume: () => void;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <View style={[styles.screen, { paddingTop: insetTop + spacing.xl }]}>
      <Text style={styles.big}>Tienes un entrenamiento sin terminar</Text>
      <Text style={styles.text}>
        {DAY_LONG[draft.day]} · {setsLabel(draft.logs.length)}.{' '}
        {resumable
          ? '¿Quieres seguir donde quedaste?'
          : 'No se puede retomar aquí, pero puedes guardar lo que hiciste antes de empezar otro.'}
      </Text>
      {resumable && <Button label="Retomar donde quedé" onPress={onResume} />}
      <Button label="Guardar lo que hice" variant={resumable ? 'secondary' : 'primary'} onPress={onKeep} />
      <Button label="Descartarlo y empezar de nuevo" variant="ghost" onPress={onDiscard} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.accent,
    padding: spacing.md,
    gap: spacing.sm,
  },
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  big: { color: colors.text, ...display(28) },
  text: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
});
