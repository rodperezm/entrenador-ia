import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardDoneBar } from '@/components/KeyboardDoneBar';
import { Button } from '@/components/ui';
import { BackupSetup, type Mode } from '@/features/account/BackupSetup';
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
import { type DayChoice, dayChoiceOf, DAYS, GENTLE_MAX, minDayMinutes, proposeWeek, sameChoice } from '@/domain/week';
import { CLOUD_BACKUP_READY } from '@/lib/cloudSync';
import { usePlan } from '@/state/plan';
import { useResetAllData } from '@/state/useResetAllData';
import { useProfile } from '@/state/profile';
import { useSync } from '@/state/sync';
import { colors, spacing } from '@/theme';

const STEPS = [
  {
    title: 'Empecemos',
    subtitle: 'Armemos tu perfil de entrenamiento.',
    Component: WelcomeStep,
    valid: (d: Draft) => d.disclaimerAccepted,
  },
  {
    title: 'Sobre ti',
    subtitle: 'Solo el sexo es obligatorio; lo demás es opcional.',
    newSubtitle: 'Con esto ajustamos tus ejercicios.',
    Component: AboutStep,
    valid: (d: Draft) =>
      d.sex !== null &&
      (!d.isNew || d.level !== null) &&
      (!d.birthText || parseBirth(d.birthText) !== null) &&
      (!d.heightText || parseHeight(d.heightText) !== null),
  },
  {
    title: 'Tu nivel',
    subtitle: 'Define la complejidad inicial de los ejercicios.',
    Component: LevelStep,
    valid: (d: Draft) => d.level !== null,
    profileOnly: true, // la primera vez va junto a «Sobre ti»
  },
  {
    title: 'Tu kettlebell',
    subtitle: 'Solo te propondremos ejercicios que puedas hacer.',
    Component: EquipmentStep,
    valid: (d: Draft) => d.kettlebellWeightsKg.length > 0,
  },
  {
    title: 'Lesiones y condiciones',
    subtitle: 'Opcional. Ajustamos los ejercicios a tus limitaciones.',
    Component: ConditionsStep,
    valid: () => true,
  },
  {
    title: 'Tu semana',
    subtitle: 'Qué quieres hacer cada día. Lo puedes cambiar cuando quieras.',
    newSubtitle: 'Te proponemos los días. Lo puedes cambiar cuando quieras.',
    Component: WeekStep,
    valid: (d: Draft) => DAYS.some((day) => d.weekChoices[day.id].length > 0),
  },
  {
    title: 'Resumen',
    subtitle: 'Revisa tu perfil. Puedes cambiarlo cuando quieras.',
    Component: SummaryStep,
    valid: () => true,
    profileOnly: true,
  },
];

// Espera a que cargue el perfil guardado: el borrador se arma una sola vez con él.
export default function Onboarding() {
  const { loading } = useProfile();
  const { loading: planLoading } = usePlan();
  const { ready } = useSync();
  return loading || planLoading || !ready ? null : <OnboardingForm />;
}

function OnboardingForm() {
  const { profile, saveProfile } = useProfile();
  const { week, applyDayChoices, updateAllDays } = usePlan();
  const resetAll = useResetAllData();
  const { enabled: hasAccount } = useSync();
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
    kettlebellPairsKg: profile?.kettlebellPairsKg ?? [],
    dumbbellWeightsKg: profile?.dumbbellWeightsKg ?? [],
    dumbbellPairsKg: profile?.dumbbellPairsKg ?? [],
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
  // Cómo estaba todo al abrir, para guardar solo lo que cambió.
  const [initialDraft] = useState(draft);
  const [saving, setSaving] = useState(false);
  // La portada solo aparece la primera vez, no al editar el perfil.
  const [showIntro, setShowIntro] = useState(!profile);
  // Primera vez: después de la portada se crea la cuenta con correo, antes del paso 1.
  const [accountMode, setAccountMode] = useState<Mode | null>(profile || hasAccount ? null : 'new');

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  // Perfil nuevo: menos pasos; del último se pasa directo a crear la semana.
  const steps = profile ? STEPS : STEPS.filter((s) => !s.profileOnly);
  const { title, subtitle, newSubtitle, Component, valid } = steps[step];
  const isLast = step === steps.length - 1;
  const conditionsStep = steps.findIndex((s) => s.Component === ConditionsStep);

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
        kettlebellPairsKg: draft.kettlebellPairsKg,
        // Sin mancuernas marcadas no se guardan sus pesos.
        dumbbellWeightsKg: draft.equipment.includes('dumbbells') ? draft.dumbbellWeightsKg : [],
        dumbbellPairsKg: draft.equipment.includes('dumbbells') ? draft.dumbbellPairsKg : [],
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
      // Solo lo que la persona cambió: recorrer el perfil y guardar no debe tocar la semana.
      const c = draft.partCounts;
      const countsChanged = JSON.stringify(c) !== JSON.stringify(initialDraft.partCounts);
      updateAllDays((d) => {
        const gentle = draft.gentleDays.includes(d.day);
        const minutesChanged = draft.weekMinutes[d.day] !== initialDraft.weekMinutes[d.day];
        if (!countsChanged && !minutesChanged && gentle === d.gentleStrength) {
          // Si cambiaron las partes del día, igual debe caber lo mínimo.
          const min = minDayMinutes(dayChoiceOf(d));
          return d.availableMinutes >= min ? d : { ...d, availableMinutes: min };
        }
        return {
          ...d,
          availableMinutes: Math.max(draft.weekMinutes[d.day], minDayMinutes(dayChoiceOf(d))),
          gentleStrength: gentle,
          blocks: countsChanged
            ? {
                warmup: { ...d.blocks.warmup, exerciseCount: c.warmup },
                prehab: { ...d.blocks.prehab, exerciseCount: c.prehab },
                main: { ...d.blocks.main, exerciseCount: gentle ? Math.min(c.main, GENTLE_MAX) : c.main },
                cooldown: { ...d.blocks.cooldown, exerciseCount: c.cooldown },
              }
            : {
                ...d.blocks,
                main: {
                  ...d.blocks.main,
                  exerciseCount: gentle
                    ? Math.min(d.blocks.main.exerciseCount, GENTLE_MAX)
                    : d.blocks.main.exerciseCount,
                },
              },
        };
      });
      router.replace(profile ? '/' : { pathname: '/', params: { generate: '1' } });
    } finally {
      setSaving(false);
    }
  };

  if (showIntro) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <IntroScreen
          onStart={() => {
            if (accountMode) setAccountMode('new');
            setShowIntro(false);
          }}
          onExisting={
            accountMode
              ? () => {
                  setAccountMode('existing');
                  setShowIntro(false);
                }
              : undefined
          }
        />
      </>
    );
  }

  if (accountMode && !hasAccount) {
    return (
      <>
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Stack.Screen options={{ headerShown: true, title: '', headerBackVisible: false }} />
          {/* La key reinicia el formulario si se entra desde «Ya tengo cuenta». */}
          <BackupSetup key={accountMode} initialMode={accountMode} signup onCreated={() => setAccountMode(null)} />
          <Button label="Volver" variant="ghost" onPress={() => setShowIntro(true)} />
        </ScrollView>
        <KeyboardDoneBar />
      </>
    );
  }

  return (
    <>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Stack.Screen
          options={{ headerShown: true, title: profile ? 'Mi perfil' : '', headerBackVisible: !!profile }}
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
          <Text style={styles.subtitle}>{(!profile && newSubtitle) || subtitle}</Text>
          <Component draft={draft} update={update} />
          {profile && step === 0 && (
            <>
              {CLOUD_BACKUP_READY && (
                <Button label="Cuenta y respaldo" variant="ghost" onPress={() => router.push('/account')} />
              )}
              <Button label="Borrar mis datos y empezar de cero" variant="ghost" onPress={resetAll} />
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <Button
            label={
              isLast
                ? saving
                  ? 'Guardando…'
                  : profile
                    ? 'Guardar cambios'
                    : new Date().getDay() === 1
                      ? 'Crear mi semana con IA'
                      : 'Armar mi preparación'
                : 'Continuar'
            }
            disabled={!valid(draft) || saving}
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
