import Ionicons from '@expo/vector-icons/Ionicons';
import { useStayAwake } from '@/lib/useStayAwake';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BodyMap } from '@/components/BodyMap';
import { Button, Stepper } from '@/components/ui';
import { EXERCISES_BY_ID } from '@/data/exercises.seed';
import { BLOCK_LABELS } from '@/domain/labels';
import { DayOfWeek, type ExerciseSlot, type PainLevel, painOf, type SetLog } from '@/domain/schema';
import { fmtClock } from '@/domain/session';
import { DAY_LONG } from '@/domain/week';
import { slotLabel } from '@/features/planner/describe';
import { useCues } from '@/features/workout/useCues';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

// Esfuerzo: cuántas repeticiones más podía hacer. Se guarda como RPE (10 = no podía más).
const EFFORT_OPTIONS = [
  { label: '4 o más', rpe: 6 },
  { label: '3', rpe: 7 },
  { label: '2', rpe: 8 },
  { label: '1', rpe: 9 },
  { label: 'Ninguna', rpe: 10 },
];
const reserveLabel = (rpe: number) => EFFORT_OPTIONS.find((o) => o.rpe === rpe)?.label ?? String(10 - rpe);
const PAIN_OPTIONS: { label: string; level: PainLevel }[] = [
  { label: 'Nada', level: 0 },
  { label: 'Leve', level: 1 },
  { label: 'Moderado', level: 2 },
  { label: 'Fuerte', level: 3 },
];
const PAIN_NAME = ['', 'molestia leve', 'dolor moderado', 'dolor fuerte'];
const exName = (id: string) => EXERCISES_BY_ID.get(id)?.name.es ?? id;

// Vista de entrenamiento libre: el usuario hace los ejercicios en el orden y
// ritmo que quiera, registra cada serie y, si quiere, usa el descanso sugerido.
export default function WorkoutScreen() {
  useStayAwake('workout');
  const insets = useSafeAreaInsets();
  const day = DayOfWeek.safeParse(useLocalSearchParams<{ day: string }>().day).data;
  const { plan } = usePlan();
  const { addSession } = useHistory();
  const dayPlan = plan?.days.find((d) => d.day === day);
  const cues = useCues(true);

  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [open, setOpen] = useState<string | null>(null); // `${bloque}-${índice}`
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const lastCount = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Descanso opcional: pitido en los últimos 3 segundos y al terminar.
  const restLeft = restEndsAt ? Math.ceil((restEndsAt - now) / 1000) : null;
  const resting = restLeft != null && restLeft > 0;
  useEffect(() => {
    if (restLeft == null || restLeft === lastCount.current) return;
    const crossedZero = restLeft <= 0 && (lastCount.current ?? 1) > 0;
    lastCount.current = restLeft;
    if (crossedZero) cues.play('work');
    else if (restLeft > 0 && restLeft <= 3) cues.play('count');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restLeft]);

  if (!dayPlan || !day) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.text}>No hay rutina para este día.</Text>
        <Button label="Volver" onPress={() => router.back()} />
      </View>
    );
  }

  const totalSets = dayPlan.blocks.reduce((n, b) => n + b.slots.reduce((m, s) => m + s.sets, 0), 0);

  const finish = () => {
    const end = now;
    setFinishedAt(end);
    setRestEndsAt(null);
    if (logs.length === 0) return;
    cues.play('done');
    cues.say('¡Lo lograste!');
    addSession({
      id: `s${startedAt.toString(36)}`,
      day,
      location: dayPlan.location,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(end).toISOString(),
      completed: logs.length >= totalSets,
      sets: logs,
    });
  };

  if (finishedAt != null)
    return <Summary logs={logs} minutes={Math.round((finishedAt - startedAt) / 60000)} insets={insets} />;

  const logSet = (slot: ExerciseSlot, entry: Omit<SetLog, 'exerciseId' | 'setNo' | 'targetReps'>) => {
    const setNo = logs.filter((l) => l.exerciseId === slot.exerciseId).length + 1;
    setLogs((l) => [...l, { exerciseId: slot.exerciseId, setNo, targetReps: slot.reps, ...entry }]);
    if (slot.restSec > 0) {
      lastCount.current = null;
      setRestEndsAt(now + slot.restSec * 1000);
      cues.play('rest');
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <View style={styles.top}>
        <Pressable onPress={() => setConfirmEnd(true)} hitSlop={12}>
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.topTitle}>{DAY_LONG[day]}</Text>
          <Text style={styles.topSub}>
            {fmtClock((now - startedAt) / 1000)} · {logs.length}/{totalSets} series
          </Text>
        </View>
        <Link href="/timer" asChild>
          <Pressable hitSlop={12} style={{ alignItems: 'center' }}>
            <Ionicons name="timer-outline" size={26} color={colors.accent} />
            <Text style={styles.timerText}>Tabata</Text>
          </Pressable>
        </Link>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}>
        <Text style={styles.hint}>Hazlos en el orden que quieras. Toca un ejercicio para registrar tus series.</Text>
        {dayPlan.blocks.map((block) => (
          <View key={block.type} style={{ gap: spacing.sm }}>
            <Text style={styles.blockTitle}>{BLOCK_LABELS[block.type]}</Text>
            {block.slots.map((slot, i) => {
              const key = `${block.type}-${i}`;
              return (
                <ExerciseCard
                  key={key}
                  slot={slot}
                  done={logs.filter((l) => l.exerciseId === slot.exerciseId)}
                  open={open === key}
                  onToggle={() => setOpen(open === key ? null : key)}
                  onLog={(entry) => logSet(slot, entry)}
                />
              );
            })}
          </View>
        ))}
        <Button label="Terminar entrenamiento" onPress={() => setConfirmEnd(true)} />
      </ScrollView>

      {/* Barra inferior: descanso opcional o confirmación de término */}
      {(confirmEnd || resting) && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
          {confirmEnd ? (
            <>
              <Text style={styles.barTitle}>¿Terminar el entrenamiento?</Text>
              <Text style={styles.hint}>
                {logs.length
                  ? `Se guardan las ${logs.length} series registradas.`
                  : 'No has registrado series; no se guardará nada.'}
              </Text>
              <Button label="Sí, terminar" onPress={finish} />
              <Button label="Seguir entrenando" variant="ghost" onPress={() => setConfirmEnd(false)} />
            </>
          ) : (
            <View style={styles.restRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.restLabel}>Descanso</Text>
                <Text style={styles.restTime}>{fmtClock(restLeft ?? 0)}</Text>
              </View>
              <Pressable onPress={() => setRestEndsAt((t) => (t ?? now) + 15000)} style={styles.restBtn}>
                <Text style={styles.restBtnText}>+15 s</Text>
              </Pressable>
              <Pressable onPress={() => setRestEndsAt(null)} style={styles.restBtn}>
                <Text style={styles.restBtnText}>Saltar</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function ExerciseCard({
  slot,
  done,
  open,
  onToggle,
  onLog,
}: {
  slot: ExerciseSlot;
  done: SetLog[];
  open: boolean;
  onToggle: () => void;
  onLog: (entry: Omit<SetLog, 'exerciseId' | 'setNo' | 'targetReps'>) => void;
}) {
  const { profile } = useProfile();
  const ex = EXERCISES_BY_ID.get(slot.exerciseId);
  const [reps, setReps] = useState(slot.reps ?? 0);
  const [seconds, setSeconds] = useState(slot.durationSec ?? 30);
  const [weight, setWeight] = useState<number | null>(slot.weightKg);
  const [rpe, setRpe] = useState<number | null>(null);
  const [pain, setPain] = useState<PainLevel | null>(null);
  if (!ex) return null;

  const complete = done.length >= slot.sets;
  const owned = profile?.kettlebellWeightsKg ?? [];
  const usesKb = ex.equipment.required.includes('kettlebell') && owned.length > 0;
  const timed = slot.durationSec != null;

  return (
    <View style={[styles.card, complete && styles.cardDone]}>
      <Pressable onPress={onToggle} style={styles.cardHead}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.cardName}>{ex.name.es}</Text>
          <Text style={styles.cardRx}>{slotLabel(slot)}</Text>
          <View style={styles.dots}>
            {Array.from({ length: slot.sets }, (_, i) => (
              <View key={i} style={[styles.dot, i < done.length && styles.dotOn]} />
            ))}
            {done.length > slot.sets && <Text style={styles.extra}>+{done.length - slot.sets}</Text>}
          </View>
        </View>
        {complete ? (
          <Ionicons name="checkmark-circle" size={28} color={colors.accent} />
        ) : (
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
        )}
      </Pressable>

      {open && (
        <View style={styles.cardBody}>
          <View style={styles.mapRow}>
            <BodyMap primary={ex.anatomy.primary} secondary={ex.anatomy.secondary} height={90} />
            <View style={{ flex: 1, gap: 4 }}>
              {ex.instructions.keyCues.slice(0, 2).map((c, i) => (
                <Text key={i} style={styles.cue}>
                  • {c.es}
                </Text>
              ))}
              <Link href={{ pathname: '/exercise/[id]', params: { id: ex.id } }} style={styles.link}>
                Ver técnica
              </Link>
            </View>
          </View>

          {done.length > 0 && (
            <View style={{ gap: 2 }}>
              {done.map((l) => (
                <Text key={l.setNo} style={styles.logged}>
                  Serie {l.setNo}: {l.repsDone != null ? `${l.repsDone} reps` : `${l.durationSec}s`}
                  {l.weightKg ? ` · ${l.weightKg} kg` : ''}
                  {l.rpe ? ` · podía ${reserveLabel(l.rpe).toLowerCase()} más` : ''}
                  {painOf(l) ? ` · ${PAIN_NAME[painOf(l)]}` : ''}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.logRow}>
            <Text style={styles.label}>{timed ? 'Segundos' : 'Repeticiones'}</Text>
            {timed ? (
              <Stepper value={seconds} min={5} max={600} step={5} suffix="s" onChange={setSeconds} />
            ) : (
              <Stepper value={reps} min={0} max={100} onChange={setReps} />
            )}
          </View>
          {usesKb && (
            <View style={styles.logRow}>
              <Text style={styles.label}>Peso (kg)</Text>
              <View style={styles.chips}>
                {owned.map((kg) => (
                  <Pressable
                    key={kg}
                    onPress={() => setWeight(kg)}
                    style={[styles.chip, weight === kg && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, weight === kg && { color: '#fff' }]}>{kg}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <Text style={styles.label}>¿Cuántas repeticiones más podías hacer? (opcional)</Text>
          <View style={styles.chips}>
            {EFFORT_OPTIONS.map((o) => (
              <Pressable
                key={o.rpe}
                onPress={() => setRpe(rpe === o.rpe ? null : o.rpe)}
                style={[styles.chip, rpe === o.rpe && styles.chipOn]}
              >
                <Text style={[styles.chipText, rpe === o.rpe && { color: '#fff' }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>¿Sentiste molestia o dolor? (opcional)</Text>
          <View style={styles.chips}>
            {PAIN_OPTIONS.map((o) => {
              const on = pain === o.level;
              return (
                <Pressable
                  key={o.level}
                  onPress={() => setPain(on ? null : o.level)}
                  style={[styles.chip, on && (o.level === 0 ? styles.chipOn : styles.painOn)]}
                >
                  <Text style={[styles.chipText, on && { color: o.level === 0 ? '#fff' : colors.bg }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {pain === 3 && (
            <Text style={styles.painWarn}>
              Si el dolor es fuerte, detén este ejercicio. La próxima rutina lo cambiará por uno más suave.
            </Text>
          )}
          <Button
            label={complete ? 'Registrar serie extra' : `Registrar serie ${done.length + 1} de ${slot.sets}`}
            onPress={() => {
              onLog({
                repsDone: timed ? null : reps,
                durationSec: timed ? seconds : null,
                weightKg: usesKb ? weight : null,
                rpe,
                painFlag: (pain ?? 0) >= 2,
                painLevel: pain,
              });
              setRpe(null);
              setPain(null);
            }}
          />
        </View>
      )}
    </View>
  );
}

function Summary({
  logs,
  minutes,
  insets,
}: {
  logs: SetLog[];
  minutes: number;
  insets: { top: number; bottom: number };
}) {
  const totalReps = logs.reduce((n, l) => n + (l.repsDone ?? 0), 0);
  const volume = logs.reduce((n, l) => n + (l.repsDone ?? 0) * (l.weightKg ?? 0), 0);
  const rpes = logs.map((l) => l.rpe).filter((v): v is number => v != null);
  const painIn = (level: PainLevel) => [
    ...new Set(logs.filter((l) => painOf(l) === level).map((l) => exName(l.exerciseId))),
  ];
  const [mild, moderate, strong] = [painIn(1), painIn(2), painIn(3)];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.summary, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
    >
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <Text style={styles.summaryTitle}>{logs.length ? '¡Lo lograste! 💪' : 'Entrenamiento terminado'}</Text>
      {logs.length > 0 && (
        <View style={styles.statsGrid}>
          <Stat label="Minutos" value={String(minutes)} />
          <Stat label="Series" value={String(logs.length)} />
          <Stat label="Repeticiones" value={String(totalReps)} />
          <Stat label="Kg movidos" value={volume ? volume.toLocaleString('es-CL') : '—'} />
          <Stat
            label="Reps de reserva"
            value={rpes.length ? (rpes.reduce((a, b) => a + (10 - b), 0) / rpes.length).toFixed(1) : '—'}
          />
        </View>
      )}
      {strong.length > 0 && (
        <View style={styles.painBox}>
          <Text style={styles.painTitle}>Dolor fuerte en: {strong.join(', ')}</Text>
          <Text style={styles.text}>
            La próxima rutina cambiará estos ejercicios por otros más suaves. Si el dolor sigue o se repite, consulta a
            un profesional.
          </Text>
        </View>
      )}
      {moderate.length > 0 && (
        <View style={styles.painBox}>
          <Text style={styles.painTitle}>Dolor moderado en: {moderate.join(', ')}</Text>
          <Text style={styles.text}>La próxima rutina bajará la exigencia de estos ejercicios.</Text>
        </View>
      )}
      {mild.length > 0 && (
        <View style={styles.painBox}>
          <Text style={styles.painTitle}>Molestia leve en: {mild.join(', ')}</Text>
          <Text style={styles.text}>La próxima rutina mantendrá la carga de estos ejercicios, sin subirla.</Text>
        </View>
      )}
      <Text style={styles.text}>
        {logs.length
          ? 'Tus series quedaron guardadas y se usarán para ajustar la próxima rutina.'
          : 'No se registró ninguna serie, así que no se guardó esta sesión.'}
      </Text>
      <Button label="Volver" onPress={() => router.back()} />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  text: { color: colors.text, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  topTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  topSub: { color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
  timerText: { color: colors.accent, fontSize: 10, fontWeight: '700' },
  content: { padding: spacing.lg, gap: spacing.lg },
  blockTitle: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  cardDone: { opacity: 0.6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  cardName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardRx: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.surfaceAlt },
  dotOn: { backgroundColor: colors.accent },
  extra: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  cardBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cue: { color: colors.text, fontSize: 13, lineHeight: 18 },
  link: { color: colors.accent, fontWeight: '700', marginTop: 4 },
  logged: { color: colors.text, fontSize: 13 },
  logRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  label: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1, justifyContent: 'flex-end' },
  chip: {
    minWidth: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  chipOn: { backgroundColor: colors.accent },
  painOn: { backgroundColor: colors.warning },
  painWarn: { color: colors.warning, fontSize: 13, lineHeight: 18 },
  chipText: { color: colors.text, fontWeight: '700' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  barTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  restLabel: { color: '#6DB89B', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  restTime: { color: colors.text, fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'] },
  restBtn: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  restBtnText: { color: colors.text, fontWeight: '700' },
  summary: { padding: spacing.xl, gap: spacing.lg },
  summaryTitle: { color: colors.text, fontSize: 32, fontWeight: '900', textAlign: 'center' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  stat: {
    width: '30%',
    minWidth: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  painBox: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  painTitle: { color: colors.warning, fontWeight: '800', textAlign: 'center' },
});
