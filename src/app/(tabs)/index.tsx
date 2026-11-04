import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { cycleInfo } from '@/domain/cycle';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { finisherOffer } from '@/domain/finisher';
import { strongPainIds } from '@/domain/generator';
import { dayMinutes } from '@/domain/timeBudget';
import { DAY_LONG, isFromPastWeek, isToday, staleDays } from '@/domain/week';
import { countExercises, describeDayConfig } from '@/features/planner/describe';
import { useGenerateWeek } from '@/features/planner/useGenerateWeek';
import { WeekCard } from '@/features/planner/WeekCard';
import { WeekStrip } from '@/features/planner/WeekStrip';
import { PainFollowUpCard } from '@/features/workout/PainFollowUpCard';
import { CLOUD_BACKUP_READY } from '@/lib/cloudSync';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { useSync } from '@/state/sync';
import { colors, radius, spacing } from '@/theme';

const SEEN_BLOCK_KEY = 'seen-block.v1';

export default function TodayScreen() {
  const { profile } = useProfile();
  const { week, plan } = usePlan();
  const { sessions } = useHistory();
  const { enabled: syncEnabled } = useSync();
  const { generate, generating, notice } = useGenerateWeek();
  const { generate: generateOnOpen } = useLocalSearchParams<{ generate?: string }>();
  const generatedOnOpen = useRef(false);
  const [seenBlock, setSeenBlock] = useState<string | null>(null);
  const [, setResumedAt] = useState(0);

  // Al volver a la app se recalcula: pudo empezar un nuevo día o una nueva semana.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setResumedAt(Date.now());
    });
    return () => sub.remove();
  }, []);

  // Al terminar el perfil, «Crear mi semana» llega aquí y arma la primera rutina.
  useEffect(() => {
    if (generateOnOpen !== '1' || generatedOnOpen.current || !profile) return;
    generatedOnOpen.current = true;
    router.setParams({ generate: undefined });
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateOnOpen, profile]);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_BLOCK_KEY)
      .then((seen) => setSeenBlock(seen ?? ''))
      .catch(() => {});
  }, []);

  if (!profile) return null;

  const stale = !!plan && staleDays(plan, week, profile.updatedAt).size > 0;
  const activeDays = week.days.filter((d) => d.active).length;
  const cycle = cycleInfo(sessions, profile.level, week.days);
  const pendingWeek = !!plan && activeDays > 0 && isFromPastWeek(plan.generatedAt);
  const newBlock = cycle.block > 1 && !pendingWeek && seenBlock !== null && seenBlock !== cycle.blockStart;
  const dismissNewBlock = () => {
    setSeenBlock(cycle.blockStart);
    AsyncStorage.setItem(SEEN_BLOCK_KEY, cycle.blockStart).catch(() => {});
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hello}>{profile.displayName ? `Hola, ${profile.displayName}` : 'Hola'} 👋</Text>
      <Link href="/plan-info" style={styles.lead}>
        {cycle.preparation
          ? 'Preparación · Tu Semana 1 parte el lunes ›'
          : `Ciclo ${cycle.block} · Semana ${cycle.week}: ${cycle.weekName} · Foco: ${cycle.phaseName} ›`}
      </Link>

      {newBlock && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Nuevo ciclo</Text>
          <Text style={styles.noticeText}>
            Mantuvimos tus patrones y cambiamos algunos ejercicios para que tu cuerpo siga progresando.
          </Text>
          <Button label="Entendido" variant="ghost" onPress={dismissNewBlock} />
        </View>
      )}

      <PainFollowUpCard />
      <TodayCard generating={generating} onGenerate={generate} />
      <WeekCard generating={generating} onGenerate={generate} />

      {stale && !pendingWeek && (
        <Link href="/week" style={styles.warnLink}>
          Algunos días cambiaron. Revísalos en tu semana ›
        </Link>
      )}
      {notice && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{notice}</Text>
        </View>
      )}

      <WeekStrip />

      <Link href="/progress" style={styles.progress}>
        Ver tu progreso ›
      </Link>

      {/* Quienes empezaron antes de pedir el correo: se les invita hasta que creen su cuenta. */}
      {CLOUD_BACKUP_READY && !syncEnabled && (
        <Link href="/account" style={styles.backup}>
          Crea tu cuenta con tu correo para no perder tu avance ›
        </Link>
      )}
    </ScrollView>
  );
}

// Lo que toca hoy, para entrar a entrenar con un solo toque.
function TodayCard({ generating, onGenerate }: { generating: boolean; onGenerate: () => void }) {
  const { profile } = useProfile();
  const { week, plan } = usePlan();
  const { sessions } = useHistory();
  const cfg = week.days.find((d) => isToday(d.day));
  if (!profile || !cfg) return null;

  const dayPlan = plan?.days.find((p) => p.day === cfg.day);
  const stale = !!plan && staleDays(plan, week, profile.updatedAt).has(cfg.day);
  const trained = sessions.some((s) => new Date(s.finishedAt).toDateString() === new Date().toDateString());
  const cycle = cycleInfo(sessions, profile.level, week.days);
  const preparing = cycle.preparation;
  const pendingWeek = !!plan && week.days.some((d) => d.active) && isFromPastWeek(plan.generatedAt);
  const painful = strongPainIds(sessions);
  const painfulToday = (dayPlan?.blocks ?? [])
    .flatMap((b) => b.slots)
    .filter((s) => painful.includes(s.exerciseId))
    .map((s) => EXERCISES_BY_ID.get(s.exerciseId)?.name.es ?? s.exerciseId);
  const openDay = () => router.push({ pathname: '/day/[day]', params: { day: cfg.day } });

  let title = `Hoy, ${DAY_LONG[cfg.day].toLowerCase()}`;
  let detail = describeDayConfig(cfg, profile.conditions.length > 0);
  let action: { label: string; onPress: () => void; ghost?: boolean } | null = null;
  let tooLong = false;
  let closingNote: string | null = null;

  const weekMissing = !plan?.days.length || pendingWeek;
  // Sin semana armada, el recuadro semanal es el que lleva la acción.
  const waitingWeek = weekMissing && !preparing;

  if (weekMissing && preparing) {
    title = 'Arma tus días de preparación';
    detail = 'Días de técnica para tomar el ritmo antes del lunes.';
    action = { label: 'Armar mi preparación', onPress: onGenerate };
  } else if (waitingWeek && cfg.active) {
    detail = 'Tu rutina de hoy aparece cuando armes la semana.';
  } else if (!cfg.active) {
    detail = 'Día de descanso. Recuperar también es parte del entrenamiento.';
  } else if (!dayPlan || stale) {
    detail = 'Este día cambió y necesita su rutina.';
    action = { label: 'Armar la rutina de hoy', onPress: openDay };
  } else if (trained) {
    title = 'Hoy ya entrenaste 💪';
    detail = `${countExercises(dayPlan)} ejercicios · ≈ ${dayMinutes(dayPlan.blocks)} min`;
    action = { label: 'Ver la rutina de hoy', onPress: openDay, ghost: true };
  } else if (painfulToday.length) {
    title = 'Antes de entrenar';
    detail = `Marcaste dolor fuerte en ${painfulToday.join(', ')}. Rehaz este día para cambiarlo por uno más suave.`;
    action = { label: 'Revisar la rutina de hoy', onPress: openDay };
  } else {
    const minutes = dayMinutes(dayPlan.blocks);
    detail = `${countExercises(dayPlan)} ejercicios · ≈ ${minutes} min`;
    tooLong = minutes > cfg.availableMinutes && !dayPlan.timeNoticeDismissed && !cfg.fitToTime;
    const closing = finisherOffer({
      slots: dayPlan.blocks
        .filter((b) => b.type === 'main_strength')
        .flatMap((b) => b.slots.map((slot, i) => ({ key: `c${i}`, slot })))
        .filter((s) => s.slot.role === 'C'),
      dayExerciseIds: dayPlan.blocks.flatMap((b) => b.slots.map((s) => s.exerciseId)),
      location: dayPlan.location,
      profile,
      exercises: EXERCISES,
      history: sessions,
      cycle,
      advice: dayPlan.finisher,
    });
    // Solo se anuncia cuando hay una sugerencia; el cierre normal no necesita aviso.
    if (closing && closing.suggested !== 'normal') {
      const who = dayPlan.finisher ? 'La IA te sugiere' : 'Te sugerimos';
      closingNote =
        closing.suggested === 'hiit'
          ? `${who} cerrar con HIIT · ≈ ${closing.hiit.minutes} min`
          : `${who} cerrar con AMRAP · ${closing.amrap.minutes} min`;
    }
    action = {
      label: 'Empezar entrenamiento',
      onPress: () => router.push({ pathname: '/workout/[day]', params: { day: cfg.day } }),
    };
  }

  return (
    <View style={[styles.today, waitingWeek && styles.todayQuiet]}>
      <Text style={styles.todayTitle}>{title}</Text>
      <Text style={styles.todayDetail}>{detail}</Text>
      {tooLong && (
        <Link href={{ pathname: '/day/[day]', params: { day: cfg.day } }} style={styles.warnLink}>
          Completa toma más de tus {cfg.availableMinutes} min. Revísala ›
        </Link>
      )}
      {closingNote && (
        <View style={styles.closing}>
          <Ionicons name="flash-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.closingText}>{closingNote}</Text>
            <Text style={styles.closingHint}>Lo eliges al llegar al bloque C.</Text>
          </View>
        </View>
      )}
      {action && (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant={action.ghost ? 'ghost' : 'primary'}
          disabled={generating}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  today: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  todayQuiet: { borderColor: colors.border },
  closing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  closingText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  closingHint: { color: colors.textMuted, fontSize: 13 },
  todayTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  todayDetail: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  notice: { backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  noticeTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  noticeText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  backup: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  progress: { color: colors.accent, fontSize: 15, fontWeight: '700', textAlign: 'center', padding: spacing.sm },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  hello: { color: colors.text, fontSize: 26, fontWeight: '800' },
  lead: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.sm },
  warn: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md },
  warnText: { color: colors.warning, fontSize: 13, lineHeight: 18 },
  warnLink: { color: colors.warning, fontSize: 14, fontWeight: '700' },
});
