import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { EXERCISES } from '@/data/exercises.seed';
import { cycleInfo } from '@/domain/cycle';
import { heavierKettlebellAdvice } from '@/domain/kettlebellAdvice';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

// Aviso en Hoy: «estás listo para una kettlebell más pesada». No presiona: se puede cerrar y
// vuelve recién en el ciclo siguiente. Sin pesa nueva, la app sigue progresando con series y tensión.

const DISMISSED_KEY = 'kb-advice-dismissed.v1'; // «<kg>@<inicio del ciclo>» de la última vez que dijo «Ahora no»

const join = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;

export function KettlebellAdviceCard() {
  const { profile } = useProfile();
  const { sessions } = useHistory();
  const { week } = usePlan();
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then(setDismissed)
      .catch(() => setDismissed(null));
  }, []);

  if (!profile || dismissed === undefined) return null;
  const advice = heavierKettlebellAdvice({ history: sessions, profile, exercises: EXERCISES });
  if (!advice) return null;
  const mark = `${advice.nextKg}@${cycleInfo(sessions, profile.level, week.days).blockStart}`;
  if (dismissed === mark) return null;

  const notNow = () => {
    setDismissed(mark);
    AsyncStorage.setItem(DISMISSED_KEY, mark).catch(() => {});
  };
  const shown = advice.exercises.slice(0, 3);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Estás listo para una kettlebell de {advice.nextKg} kg</Text>
      <Text style={styles.text}>
        Ya dominas tus {advice.currentKg} kg en {join(shown)}: completas todas las series al tope, con esfuerzo
        controlado y sin dolor.
      </Text>
      <Text style={styles.text}>
        No reemplaza la que tienes: la de {advice.currentKg} kg sigue sirviendo para press y brazos, y la nueva va para
        piernas, cadera y remos. Si no la consigues, seguimos progresando con más series y más tensión.
      </Text>
      <Button label="Ya la tengo: agregarla a mi perfil" onPress={() => router.push('/onboarding')} />
      <Button label="Ahora no" variant="ghost" onPress={notNow} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  text: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});
