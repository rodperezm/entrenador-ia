import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardDoneBar } from '@/components/KeyboardDoneBar';
import { Button } from '@/components/ui';
import {
  AboutStep,
  BASE_EQUIPMENT,
  ConditionsStep,
  type Draft,
  EquipmentStep,
  formatBirth,
  IntroScreen,
  LevelStep,
  parseBirth,
  parseHeight,
  SummaryStep,
  WeekStep,
  WelcomeStep,
} from '@/features/onboarding/steps';
import { type DayChoice, dayChoiceOf, DAYS, GENTLE_MAX, proposeWeek, sameChoice } from '@/domain/week';
import { usePlan } from '@/state/plan';
import { useResetAllData } from '@/state/useResetAllData';
import { useProfile } from '@/state/profile';
import { colors, spacing } from '@/theme';

const STEPS = [
  { title: 'Empecemos', subtitle: 'Armemos tu perfil de entrenamiento.', Component: WelcomeStep },
  {
    title: 'Sobre ti',
    subtitle: 'Solo el sexo es obligatorio; lo demás puedes completarlo después.',
    Component: AboutStep,
  },
  { title: 'Tu nivel', subtitle: 'Define la complejidad inicial de los ejercicios.', Component: LevelStep },
  { title: 'Tu kettlebell', subtitle: 'Solo te propondremos ejercicios que puedas hacer.', Component: EquipmentStep },
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
    d.sex !== null &&
      (!d.birthText || parseBirth(d.birthText) !== null) &&
      (!d.heightText || parseHeight(d.heightText) !== null),
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
  const resetAll = useResetAllData();
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
    parkEquipment: profile?.parkEquipment ?? [],
    kettlebellWeightsKg: profile?.kettlebellWeightsKg ?? [],
    conditions: profile?.conditions ?? [],
    sex: profile?.sex ?? null,
    birthText: formatBirth(profile?.birthDate ?? null),
    heightText: profile?.heightCm ? String(profile.heightCm) : '',
    isNew: !profile,
    weekChoices: initialChoices,
    gentleDays: week.days.filter((d) => d.gentleStrength).map((d) => d.day),
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
  // La portada solo aparece la primera vez, no al editar el perfil.
  const [showIntro, setShowIntro] = useState(!profile);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  // Perfil nuevo: sin resumen; del último paso se pasa directo a crear la semana.
  const steps = profile ? STEPS : STEPS.slice(0, -1);
  const { title, subtitle, Component } = steps[step];
  const isLast = step === steps.length - 1;
  const conditionsStep = STEPS.findIndex((s) => s.Component === ConditionsStep);

  const next = () => {
    // Al llegar a «Tu semana» por primera vez, ya viene propuesta según lesiones.
    if (!profile && step === conditionsStep) {
      const { choices, gentle } = proposeWeek(3, draft.conditions.length > 0);
      update({ weekChoices: choices, gentleDays: gentle });
    }
    setStep(step + 1);
  };

  const finish = async () => {
    setSaving(true);
    try {
      await saveProfile({
        displayName: draft.displayName.trim(),
        level: draft.level!,
        equipment: draft.equipment,
        parkEquipment: draft.parkEquipment,
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
        gentleStrength: draft.gentleDays.includes(d.day),
        blocks: {
          warmup: { ...d.blocks.warmup, exerciseCount: c.warmup },
          prehab: { ...d.blocks.prehab, exerciseCount: c.prehab },
          main: {
            ...d.blocks.main,
            exerciseCount: draft.gentleDays.includes(d.day) ? Math.min(c.main, GENTLE_MAX) : c.main,
          },
          cooldown: { ...d.blocks.cooldown, exerciseCount: c.cooldown },
        },
      }));
      router.replace(profile ? '/' : { pathname: '/', params: { generate: '1' } });
    } finally {
      setSaving(false);
    }
  };

  if (showIntro) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <IntroScreen onStart={() => setShowIntro(false)} />
      </>
    );
  }

  return (
    <>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Stack.Screen
          options={{ headerShown: true, title: profile ? 'Editar perfil' : '', headerBackVisible: !!profile }}
        />

        <View style={styles.progress}>
          {steps.map((_, i) => (
            <View key={i} style={[styles.progressBar, i <= step && styles.progressOn]} />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.stepCount}>
            Paso {step + 1} de {steps.length}
          </Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Component draft={draft} update={update} />
          {profile && step === 0 && (
            <Button label="Borrar mis datos y empezar de cero" variant="ghost" onPress={resetAll} />
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <Button
            label={isLast ? (saving ? 'Guardando…' : profile ? 'Guardar y empezar' : 'Crear mi semana con IA') : 'Continuar'}
            disabled={!canContinue(step, draft) || saving}
            onPress={isLast ? finish : next}
          />
          {step > 0 && <Button label="Atrás" variant="ghost" onPress={() => setStep(step - 1)} />}
        </View>
      </KeyboardAvoidingView>
      <KeyboardDoneBar />
    </>
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
