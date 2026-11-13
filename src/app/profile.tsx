import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { EQUIPMENT, HEALTH_ALERTS, MEDICAL_CONDITIONS, PARK_EQUIPMENT } from '@/domain/catalog';
import { dayChoiceLabel, dayChoiceOf, DAYS } from '@/domain/week';
import { type EditStep, formatBirth, LEVELS } from '@/features/onboarding/steps';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { useResetAllData } from '@/state/useResetAllData';
import { colors, display, radius, spacing } from '@/theme';

// Resumen del perfil: cada tarjeta abre directo el paso que la cambia, sin recorrer todo el registro.
export default function ProfileScreen() {
  const { profile, loading } = useProfile();
  const { week, loading: planLoading } = usePlan();
  const resetAll = useResetAllData();
  const insets = useSafeAreaInsets();
  if (loading || planLoading) return null;
  if (!profile) return <Redirect href="/onboarding" />;

  const weights = (all: number[], pairs: number[]) =>
    all.map((k) => (pairs.includes(k) ? `2 × ${k} kg` : `${k} kg`)).join(', ');
  const hasConditions = profile.conditions.length > 0;
  const alerts = profile.healthAlerts;

  const cards: { step: EditStep; title: string; lines: string[] }[] = [
    {
      step: 'welcome',
      title: 'Tu nombre y alertas médicas',
      lines: [
        profile.displayName || 'Sin nombre',
        alerts == null
          ? 'Alertas médicas: sin responder'
          : alerts.length
            ? `Alertas médicas: ${alerts.map((a) => HEALTH_ALERTS[a]).join('; ')}`
            : 'Alertas médicas: ninguna',
      ],
    },
    {
      step: 'about',
      title: 'Sobre ti',
      lines: [
        [
          profile.sex === 'female' ? 'Mujer' : profile.sex === 'male' ? 'Hombre' : null,
          formatBirth(profile.birthDate ?? null) || null,
          profile.heightCm ? `${profile.heightCm} cm` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Sin datos',
      ],
    },
    { step: 'level', title: 'Tu nivel', lines: [LEVELS.find((l) => l.id === profile.level)?.title ?? '—'] },
    {
      step: 'equipment',
      title: 'Equipamiento',
      lines: [
        `Kettlebells: ${weights(profile.kettlebellWeightsKg, profile.kettlebellPairsKg) || '—'}`,
        ...(profile.equipment.includes('dumbbells')
          ? [`Mancuernas: ${weights(profile.dumbbellWeightsKg, profile.dumbbellPairsKg) || 'sin peso indicado'}`]
          : []),
        `En casa: ${profile.equipment.map((e) => EQUIPMENT[e]).join(', ')}`,
        `En el parque: ${profile.parkEquipment.map((e) => PARK_EQUIPMENT[e]).join(', ') || 'solo lo que llevas'}`,
      ],
    },
    {
      step: 'conditions',
      title: 'Lesiones y condiciones',
      lines: [
        profile.conditions.map((c) => MEDICAL_CONDITIONS.find((m) => m.id === c.conditionId)?.name).join(', ') ||
          'Ninguna',
      ],
    },
    {
      step: 'week',
      title: 'Tu semana',
      lines: week.days.map((d) => {
        const label = dayChoiceLabel(dayChoiceOf(d), hasConditions).toLowerCase();
        const short = DAYS.find((x) => x.id === d.day)?.short ?? d.day;
        return `${short}: ${label}${d.active ? ` · ${d.availableMinutes} min` : ''}`;
      }),
    },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xl }]}
    >
      {cards.map((card) => (
        <Pressable
          key={card.step}
          onPress={() => router.push({ pathname: '/onboarding', params: { edit: card.step } })}
          accessibilityRole="button"
          accessibilityLabel={`Cambiar ${card.title}`}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
        >
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.change}>Cambiar ›</Text>
          </View>
          {card.lines.map((line, i) => (
            <Text key={i} style={styles.line}>
              {line}
            </Text>
          ))}
        </Pressable>
      ))}

      <View style={styles.actions}>
        <Button label="Cuenta y respaldo" variant="ghost" onPress={() => router.push('/account')} />
        <Button label="Borrar mis datos y empezar de cero" variant="ghost" onPress={resetAll} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 4,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  cardTitle: { color: colors.text, ...display(22), flex: 1 },
  change: { color: colors.link, fontSize: 15, fontWeight: '700' },
  line: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
  actions: { gap: spacing.xs, marginTop: spacing.md },
});
