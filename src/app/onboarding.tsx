import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import {
  AboutStep,
  BASE_EQUIPMENT,
  ConditionsStep,
  type Draft,
  EquipmentStep,
  formatBirth,
  LevelStep,
  parseBirth,
  parseHeight,
  SummaryStep,
  WeekStep,
  WelcomeStep,
} from '@/features/onboarding/steps';
import { type DayChoice, dayChoiceOf, DAYS, sameChoice } from '@/domain/week';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, spacing } from '@/theme';

const STEPS = [
  { title: 'Bienvenido', subtitle: 'Armemos tu perfil de entrenamiento.', Component: WelcomeStep },
  { title: 'Sobre ti', subtitle: 'Para tus índices corporales y para ajustar tu entrenamiento.', Component: AboutStep },
  { title: 'Tu nivel', subtitle: 'Define la complejidad inicial de los ejercicios.', Component: LevelStep },
  { title: 'Tu equipamiento', subtitle: 'Solo te propondremos ejercicios que puedas hacer.', Component: EquipmentStep },
  {
    title: 'Condiciones médicas',
    subtitle: 'Opcional. Ajustamos los ejercicios a tus limitaciones.',
    Component: ConditionsStep,
  },
  {
    title: 'Tu semana',
    subtitle: 'Qué quieres hacer cada día. Lo puedes cambiar cuando quieras.',
    Component: WeekStep,
  },
  { title: 'Resumen', subtitle: 'Revisa tu perfil. Puedes cambiarlo cuando quieras.', Component: SummaryStep },
];

const canContinue = (step: number, d: Draft) =>
  [
    d.disclaimerAccepted,
    d.sex !== null && parseBirth(d.birthText) !== null && parseHeight(d.heightText) !== null,
    d.level !== null,
    d.kettlebellWeightsKg.length > 0,
    true,
    DAYS.some((day) => d.weekChoices[day.id].length > 0),
    true,
  ][step];

// Espera a que cargue el perfil guardado: el borrador se arma una sola vez con él.
export default function Onboarding() {
  const { loading } = useProfile();
  const { loading: planLoading } = usePlan();
  return loading || planLoading ? null : <OnboardingForm />;
}

function OnboardingForm() {
  const { profile, saveProfile } = useProfile();
  const { week, applyDayChoices, updateAllDays } = usePlan();
  // Partes de cada día al abrir.
  const [initialChoices] = useState(
    () =>
      Object.fromEntries(week.days.map((d) => [d.day, dayChoiceOf(d)])) as Record<
        (typeof DAYS)[number]['id'],
        DayChoice
      >,
  );
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => ({
    displayName: profile?.displayName ?? '',
    disclaimerAccepted: !!profile,
    level: profile?.level ?? null,
    equipment: profile?.equipment ?? BASE_EQUIPMENT,
    kettlebellWeightsKg: profile?.kettlebellWeightsKg ?? [],
    conditions: profile?.conditions ?? [],
    sex: profile?.sex ?? null,
    birthText: formatBirth(profile?.birthDate ?? null),
    heightText: profile?.heightCm ? String(profile.heightCm) : '',
    weekChoices: initialChoices,
    weekMinutes: Object.fromEntries(week.days.map((d) => [d.day, d.availableMinutes])) as Draft['weekMinutes'],
    // Las cantidades se eligen para toda la semana; se parte de las del primer día de entrenamiento.
    partCounts: (() => {
      const b = (week.days.find((d) => d.active) ?? week.days[0]).blocks;
      return {
        warmup: b.warmup.exerciseCount,
        prehab: b.prehab.exerciseCount,
        main: b.main.exerciseCount,
        cooldown: b.cooldown.exerciseCount,
      };
    })(),
  }));
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const { title, subtitle, Component } = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const finish = async () => {
    setSaving(true);
    try {
      await saveProfile({
        displayName: draft.displayName.trim(),
        level: draft.level!,
        equipment: draft.equipment,
        kettlebellWeightsKg: draft.kettlebellWeightsKg,
        conditions: draft.conditions,
        sex: draft.sex,
        birthDate: parseBirth(draft.birthText),
        heightCm: parseHeight(draft.heightText),
        excludedExerciseIds: profile?.excludedExerciseIds ?? [],
        disclaimerAcceptedAt: profile?.disclaimerAcceptedAt ?? new Date().toISOString(),
      });
      // Solo los días que cambiaron: así no se pisa lo que el usuario afinó.
      applyDayChoices(
        Object.fromEntries(
          DAYS.filter((d) => !sameChoice(draft.weekChoices[d.id], initialChoices[d.id])).map((d) => [
            d.id,
            draft.weekChoices[d.id],
          ]),
        ),
      );
      const c = draft.partCounts;
      updateAllDays((d) => ({
        ...d,
        availableMinutes: draft.weekMinutes[d.day],
        blocks: {
          warmup: { ...d.blocks.warmup, exerciseCount: c.warmup },
          prehab: { ...d.blocks.prehab, exerciseCount: c.prehab },
          main: { ...d.blocks.main, exerciseCount: c.main },
          cooldown: { ...d.blocks.cooldown, exerciseCount: c.cooldown },
        },
      }));
      router.replace('/');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: profile ? 'Editar perfil' : '', headerBackVisible: !!profile }} />

      <View style={styles.progress}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.progressBar, i <= step && styles.progressOn]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepCount}>
          Paso {step + 1} de {STEPS.length}
        </Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Component draft={draft} update={update} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button
          label={isLast ? (saving ? 'Guardando…' : 'Guardar y empezar') : 'Continuar'}
          disabled={!canContinue(step, draft) || saving}
          onPress={isLast ? finish : () => setStep(step + 1)}
        />
        {step > 0 && <Button label="Atrás" variant="ghost" onPress={() => setStep(step - 1)} />}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt },
  progressOn: { backgroundColor: colors.accent },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  stepCount: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 15, marginBottom: spacing.md },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
