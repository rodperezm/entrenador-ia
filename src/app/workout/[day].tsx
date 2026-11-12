import { BebasNeue_400Regular, useFonts } from '@expo-google-fonts/bebas-neue';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStayAwake } from '@/lib/useStayAwake';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BodyMap } from '@/components/BodyMap';
import { Button, CheckRow, Stepper } from '@/components/ui';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { modificationFor } from '@/data/modifications';
import { averageMet, kcalRangeLabel, latestWeight } from '@/domain/calories';
import { equipmentAt } from '@/domain/catalog';
import { filterExercisesForUser, weightsFor } from '@/domain/filter';
import { isGentle } from '@/domain/generator';
import { cycleInfo } from '@/domain/cycle';
import { finisherOffer, type FinisherExercise, type FinisherOffer } from '@/domain/finisher';
import { EFFORT_OPTIONS, EFFORT_QUESTION, effortKind } from '@/domain/effort';
import { BLOCK_LABELS } from '@/domain/labels';
import { strengthInfo } from '@/domain/strength';
import {
  type BlockType,
  type CantDoReason,
  type CheckIn,
  DayOfWeek,
  type Feeling,
  type ExerciseSlot,
  type PainLevel,
  type PainSide,
  painOf,
  type SetLog,
  type WorkoutSession,
} from '@/domain/schema';
import { fmtClock } from '@/domain/session';
import { alternatingSplit, isPerSide, loadCount, sideLabel, weightLabel } from '@/domain/sides';
import { DAY_LONG } from '@/domain/week';
import { canResume, sessionFromDraft, sessionIdOf, type WorkoutDraft } from '@/domain/workoutDraft';
import { slotLabel } from '@/features/planner/describe';
import { CANT_DO_OPTIONS, easierAlternative, replacementSlot } from '@/domain/cantDo';
import { adjustForCheckIn, allowsFinisher } from '@/domain/checkIn';
import { AmrapBlock, type AmrapResult } from '@/features/workout/AmrapBlock';
import { AfterWarmupQuestion, ArrivalQuestion, checkInMessage } from '@/features/workout/CheckInPanel';
import { clearDraft, DraftSaver, ResumePrompt, useWorkoutDraft } from '@/features/workout/draft';
import type { FinisherFeedbackResult } from '@/features/workout/FinisherFeedback';
import { HiitBlock, type HiitResult } from '@/features/workout/HiitBlock';
import { PAIN_OPTIONS, PainPicker, SidePicker } from '@/features/workout/PainControls';
import { useCues } from '@/features/workout/useCues';
import { useBody } from '@/state/body';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

const SIDE_NOTE: Record<PainSide, string> = {
  left: ' (lado izquierdo)',
  right: ' (lado derecho)',
  both: ' (ambos lados)',
};
const exName = (id: string) => EXERCISES_BY_ID.get(id)?.name.es ?? id;
const FEELING_OPTIONS: { id: Feeling; label: string }[] = [
  { id: 'wanted_more', label: 'Me quedé con ganas' },
  { id: 'right', label: 'Justo' },
  { id: 'too_much', label: 'Fue mucho' },
];
const FEELING_NOTE: Record<Feeling, string> = {
  wanted_more: 'Anotado: la próxima vez podemos subir.',
  right: 'Anotado: seguimos con tu progresión.',
  too_much: 'Anotado: la próxima vez no subimos nada.',
};

type Item = { key: string; block: BlockType; slot: ExerciseSlot };
type Phase = 'work' | 'rest' | 'feedback';
type Override = { reps?: number; seconds?: number; weight?: number | null };

// Entrenamiento guiado: un ejercicio a la vez. «✓ Hecha» registra lo planificado,
// el descanso arranca solo y al terminar las series se pregunta el esfuerzo una vez.
// «Ver todos» permite saltar a otro ejercicio para cambiar el orden.
const BOTTOM_BAR_SPACE = 140; // alto que tapa la barra de descanso o confirmación
const CLOCK_LARGE = 88;
const CLOCK_MEDIUM = 64;
const CLOCK_SMALL = 32;
const COMPACT_HEIGHT = 720;
const TICK_KEY = 'workout-tick.v1'; // 'off' si la persona apagó el tic-tac del descanso
// Sesión que parece hecha sin querer: menos de 5 minutos o series marcadas cada menos de 5 segundos.
const SHORT_SESSION_MS = 5 * 60 * 1000;
const FAST_TAP_MS = 5000;
type SaveState = 'saved' | 'discarded' | { ask: 'short' | 'fast' };

export default function WorkoutScreen() {
  useStayAwake('workout');
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  const day = DayOfWeek.safeParse(useLocalSearchParams<{ day: string }>().day).data;
  const { week, plan } = usePlan();
  const { sessions, addSession, updateSession, removeSession } = useHistory();
  const { profile } = useProfile();
  const { records } = useBody();
  const dayPlan = plan?.days.find((d) => d.day === day);
  const cues = useCues(true);

  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [logs, setLogs] = useState<(SetLog & { itemKey: string })[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('work');
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [adjusting, setAdjusting] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  const [pain, setPain] = useState<PainLevel | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [techniqueOk, setTechniqueOk] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  // Dolor con lesión conocida: nivel por ejercicio, hoja de opciones y ejercicios cambiados.
  const [itemPain, setItemPain] = useState<Record<string, PainLevel>>({});
  const [painSides, setPainSides] = useState<Record<string, PainSide>>({});
  const [painSheet, setPainSheet] = useState<'levels' | PainLevel | null>(null);
  const [painAsked, setPainAsked] = useState(false);
  const [replacements, setReplacements] = useState<Record<string, Item>>({});
  const [showAll, setShowAll] = useState(false);
  const [closing, setClosing] = useState<{ format: 'hiit' | 'amrap'; offer: FinisherOffer } | null>(null);
  const [closingDismissed, setClosingDismissed] = useState(false);
  const amrapResult = useRef<WorkoutSession['amrap']>(undefined);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const lastCount = useRef<number | null>(null);
  const [tickOn, setTickOn] = useState(true);
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // «No puedo hacerlo»: hoja abierta (con o sin motivo) y lo marcado, que se guarda en la sesión.
  const [cantDoSheet, setCantDoSheet] = useState<CantDoReason | 'ask' | null>(null);
  const cantDo = useRef<NonNullable<WorkoutSession['cantDo']>>([]);
  // Guardar la sesión: si parece un error se pregunta; después se puede descartar.
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const pendingSession = useRef<WorkoutSession | null>(null);
  const markTimes = useRef<number[]>([]); // cuándo se marcó cada serie
  // Ejercicios que hace modificados hoy (clave del ejercicio en la sesión).
  const [modifiedKeys, setModifiedKeys] = useState<string[]>([]);
  // Un entrenamiento que quedó a medias (el sistema cerró la app): al abrir se ofrece retomarlo.
  // Se decide una sola vez, con lo que había guardado al entrar a esta pantalla.
  const savedDraft = useWorkoutDraft();
  const [entryDraft, setEntryDraft] = useState<WorkoutDraft | null | undefined>(undefined);
  if (entryDraft === undefined && savedDraft !== undefined) setEntryDraft(savedDraft);
  const [draftChoice, setDraftChoice] = useState<'pending' | 'done'>('pending');
  // Terminar y guardar pasan una sola vez, aunque el botón reciba dos toques seguidos.
  const finishing = useRef(false);
  const savedOnce = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(TICK_KEY)
      .then((v) => v === 'off' && setTickOn(false))
      .catch(() => {});
  }, []);
  const toggleTick = () => {
    setTickOn((on) => {
      AsyncStorage.setItem(TICK_KEY, on ? 'off' : 'on').catch(() => {});
      return !on;
    });
  };

  // Descanso: tic-tac cada segundo (si está activo) y pitidos en los últimos 3; al
  // terminar vuelve solo a la siguiente serie. El tic-tac suena solo cuando el reloj
  // baja de a un segundo, no al empezar ni al sumar tiempo.
  const restLeft = restEndsAt ? Math.ceil((restEndsAt - now) / 1000) : null;
  useEffect(() => {
    if (restLeft == null || restLeft === lastCount.current) return;
    const prev = lastCount.current;
    const crossedZero = restLeft <= 0 && (prev ?? 1) > 0;
    lastCount.current = restLeft;
    if (crossedZero) {
      cues.play('work');
      setRestEndsAt(null);
      setPhase('work');
    } else if (restLeft > 0 && restLeft <= 3) cues.play('count');
    else if (tickOn && prev === restLeft + 1) cues.play(restLeft % 2 ? 'tock' : 'tick');
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

  // La sesión de hoy según cómo llegó la persona; el plan guardado no cambia.
  const planFor = (c: CheckIn | null) =>
    profile ? adjustForCheckIn(dayPlan, c ?? undefined, { profile, exercises: EXERCISES }) : dayPlan;
  const itemsOf = (plan: typeof dayPlan, repl: Record<string, Item> = replacements): Item[] =>
    plan.blocks.flatMap((b) =>
      b.slots.flatMap((slot, i) => {
        // Un ejercicio cambiado (por dolor o porque no pudo) queda cerrado y su reemplazo va
        // justo después; el reemplazo también puede cambiarse.
        const chain = (it: Item): Item[] => (repl[it.key] ? [it, ...chain(repl[it.key])] : [it]);
        return chain({ key: `${b.type}-${i}`, block: b.type, slot });
      }),
    );
  const todayPlan = planFor(checkIn);
  const has = (type: BlockType) => dayPlan.blocks.some((b) => b.type === type && b.slots.length > 0);
  const dayParts = { warmup: has('warmup'), strength: has('main_strength') };
  const items = itemsOf(todayPlan);
  const hasConditions = (profile?.conditions.length ?? 0) > 0;
  const setsDone = (key: string) => logs.filter((l) => l.itemKey === key).length;
  // Un ejercicio cambiado por otro cuenta solo lo que alcanzó a hacer; el resto lo hace el reemplazo.
  const totalSets = items.reduce((n, it) => n + (replacements[it.key] ? setsDone(it.key) : it.slot.sets), 0);
  const isComplete = (it: Item) => setsDone(it.key) >= it.slot.sets;
  const isClosed = (it: Item) => isComplete(it) || skipped.includes(it.key);

  const finish = (doneLogs = logs) => {
    if (finishing.current) return;
    finishing.current = true;
    // El dolor marcado se guarda siempre: en las series hechas y, si el ejercicio
    // no alcanzó a tener series, como una serie sin repeticiones (para que la
    // próxima rutina lo cambie o lo alivie).
    const withPain = doneLogs.map((l) => {
      const level = Math.max(l.painLevel ?? 0, itemPain[l.itemKey] ?? 0) as PainLevel;
      return level
        ? { ...l, painLevel: level, painFlag: level >= 2, painSide: painSides[l.itemKey] ?? l.painSide ?? null }
        : l;
    });
    const painOnly = Object.entries(itemPain)
      .filter(([key, level]) => level > 0 && !withPain.some((l) => l.itemKey === key))
      .flatMap(([key, level]) => {
        const it = items.find((i) => i.key === key);
        if (!it) return [];
        return [
          {
            itemKey: key,
            exerciseId: it.slot.exerciseId,
            setNo: 1,
            targetReps: it.slot.reps,
            repsDone: it.slot.durationSec != null ? null : 0,
            durationSec: it.slot.durationSec != null ? 0 : null,
            weightKg: null,
            rpe: null,
            painFlag: level >= 2,
            painLevel: level,
            painSide: painSides[key] ?? null,
          },
        ];
      });
    const allLogs = [...withPain, ...painOnly];
    setLogs(allLogs);
    const end = now;
    setFinishedAt(end);
    setRestEndsAt(null);
    if (allLogs.length === 0) {
      clearDraft();
      return;
    }
    const session: WorkoutSession = {
      id: sessionIdOf(startedAt),
      day,
      location: dayPlan.location,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(end).toISOString(),
      completed: allLogs.length >= totalSets,
      sets: allLogs.map(({ itemKey: _k, ...l }) => l),
      ...(amrapResult.current ? { amrap: amrapResult.current } : {}),
      ...(checkIn ? { checkIn } : {}),
      ...(cantDo.current.length ? { cantDo: cantDo.current } : {}),
      ...(modifiedKeys.length
        ? {
            modified: [...new Set(items.filter((it) => modifiedKeys.includes(it.key)).map((it) => it.slot.exerciseId))],
          }
        : {}),
    };
    // Parece un error (muy corta o series marcadas en segundos): se pregunta antes de guardar,
    // porque una sesión cuenta para el ciclo, la progresión y la IA.
    const taps = markTimes.current;
    const fastTaps = taps.length >= 4 && (taps[taps.length - 1] - taps[0]) / (taps.length - 1) < FAST_TAP_MS;
    const tooShort = end - startedAt < SHORT_SESSION_MS;
    if (fastTaps || tooShort) {
      pendingSession.current = session;
      setSaveState({ ask: tooShort ? 'short' : 'fast' });
      return;
    }
    saveSession(session);
  };
  const saveSession = (s: WorkoutSession) => {
    if (savedOnce.current) return;
    savedOnce.current = true;
    clearDraft();
    cues.play('done');
    cues.say('¡Lo lograste!');
    addSession(s);
    setSaveState('saved');
  };
  const sessionId = sessionIdOf(startedAt);

  // ---------- Entrenamiento sin terminar ----------
  const pendingDraft = draftChoice === 'pending' && entryDraft?.logs.length ? entryDraft : null;
  const resumable = !!pendingDraft && canResume(pendingDraft, { day, planGeneratedAt: plan?.generatedAt ?? null, now });
  const keepDraft = (d: WorkoutDraft) => {
    addSession(sessionFromDraft(d));
    clearDraft();
  };
  const resumeDraft = (d: WorkoutDraft) => {
    const restored = itemsOf(planFor(d.checkIn), d.replacements);
    const closed = (it: Item) =>
      d.logs.filter((l) => l.itemKey === it.key).length >= it.slot.sets || d.skipped.includes(it.key);
    const at = restored[d.idx];
    // Quedó en la pregunta de esfuerzo: se vuelve ahí. Si no, al ejercicio donde iba o al primero pendiente.
    const askEffort = d.feedback && !!at && !d.skipped.includes(at.key) && closed(at);
    const open = at && !closed(at) ? d.idx : restored.findIndex((it) => !closed(it));
    if (!askEffort && open < 0) {
      // No quedaba nada por hacer: solo faltaba guardarla.
      keepDraft(d);
      router.back();
      return;
    }
    setStartedAt(d.startedAt);
    setLogs(d.logs);
    setCheckIn(d.checkIn);
    setOverrides(d.overrides);
    setSkipped(d.skipped);
    setItemPain(d.itemPain);
    setPainSides(d.painSides);
    setReplacements(d.replacements);
    setModifiedKeys(d.modifiedKeys);
    setClosingDismissed(d.closingDismissed);
    cantDo.current = d.cantDo ?? [];
    amrapResult.current = d.amrap;
    markTimes.current = d.markTimes;
    setIdx(askEffort ? d.idx : open);
    setPhase(askEffort ? 'feedback' : 'work');
    setNote('Seguimos donde quedaste.');
    setDraftChoice('done');
  };

  if (finishedAt != null) {
    const minutes = Math.round((finishedAt - startedAt) / 60000);
    const weightKg = latestWeight(records);
    // Con el tiempo real de la sesión y la intensidad promedio de la rutina.
    const kcal =
      weightKg && dayPlan && minutes > 0
        ? kcalRangeLabel(averageMet(dayPlan.blocks, EXERCISES_BY_ID), weightKg, minutes)
        : null;
    const completed = logs.length >= totalSets;
    return (
      <Summary
        logs={logs}
        minutes={minutes}
        kcal={kcal}
        insets={insets}
        feeling={sessions.find((s) => s.id === sessionId)?.feeling ?? null}
        onFeeling={(feeling) => updateSession(sessionId, { feeling })}
        cameTired={checkIn?.arrival === 'tired' && completed}
        saveState={saveState}
        onSave={() => pendingSession.current && saveSession(pendingSession.current)}
        onDiscard={() => {
          clearDraft();
          removeSession(sessionId);
          setSaveState('discarded');
        }}
      />
    );
  }

  // Mientras se lee si quedó algo a medias, no se muestra nada (es un instante).
  if (entryDraft === undefined) {
    return <View style={styles.screen} />;
  }
  if (pendingDraft) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
        <ResumePrompt
          draft={pendingDraft}
          resumable={resumable}
          insetTop={insets.top}
          onResume={() => resumeDraft(pendingDraft)}
          onKeep={() => {
            keepDraft(pendingDraft);
            // Era este mismo entrenamiento: ya quedó guardado. Si era otro, se sigue con el de hoy.
            if (resumable) router.back();
            else setDraftChoice('done');
          }}
          onDiscard={() => {
            clearDraft();
            setDraftChoice('done');
          }}
        />
      </>
    );
  }

  // Antes del primer ejercicio: cómo llega la persona.
  if (!checkIn) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
        <ArrivalQuestion
          insetTop={insets.top}
          onAnswer={(c) => {
            setCheckIn(c);
            setNote(checkInMessage(c, dayParts));
            setIdx(0);
          }}
        />
      </>
    );
  }

  // Llegó cansado: al terminar el calentamiento se vuelve a preguntar.
  const warmupItems = items.filter((it) => it.block === 'warmup');
  const askAgain =
    checkIn.arrival === 'tired' &&
    !checkIn.afterWarmup &&
    dayParts.strength && // sin Fuerza, el cansancio no cambia nada y no hay qué volver a preguntar
    warmupItems.length > 0 &&
    warmupItems.every(isClosed);
  if (askAgain) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <AfterWarmupQuestion
          insetTop={insets.top}
          onAnswer={(afterWarmup) => {
            const next = { ...checkIn, afterWarmup };
            const nextItems = itemsOf(planFor(next));
            setCheckIn(next);
            setNote(checkInMessage(next, dayParts));
            const open = nextItems.findIndex((it) => it.block !== 'warmup' && !isClosed(it));
            if (open < 0) finish();
            else setIdx(open);
          }}
        />
      </>
    );
  }

  if (!items.length) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
        <Text style={styles.text}>{note ?? 'Hoy no hay ejercicios que hacer con esa molestia.'}</Text>
        <Button label="Volver" onPress={() => router.back()} />
      </View>
    );
  }

  const item = items[Math.min(idx, items.length - 1)];
  const ex = EXERCISES_BY_ID.get(item.slot.exerciseId);
  // En calentamiento y elongación todo va de un toque, sin pregunta de esfuerzo.
  const kind = item.block === 'warmup' || item.block === 'cooldown' || !ex ? 'none' : effortKind(ex);
  const done = setsDone(item.key);
  const timed = item.slot.durationSec != null;
  const ov = overrides[item.key] ?? {};
  const reps = ov.reps ?? item.slot.reps ?? 0;
  const seconds = ov.seconds ?? item.slot.durationSec ?? 30;
  const owned = ex && profile ? weightsFor(ex, profile) : [];
  // Ejercicios con kettlebell o mancuernas: se elige y registra el peso.
  const usesKb = !!ex && (ex.equipment.required.includes('kettlebell') || ex.dumbbellGuide != null) && owned.length > 0;
  const weight = ov.weight !== undefined ? ov.weight : item.slot.weightKg;
  const painHere = (p: PainLevel | null) => Math.max(p ?? 0, itemPain[item.key] ?? 0) as PainLevel;
  const setOv = (patch: Override) => setOverrides((o) => ({ ...o, [item.key]: { ...o[item.key], ...patch } }));
  const askSide = isPerSide(item.slot.exerciseId);
  const painSide = painSides[item.key] ?? null;
  const setPainSide = (side: PainSide) => setPainSides((s) => ({ ...s, [item.key]: side }));

  // Siguiente ejercicio pendiente después del actual (o el primero pendiente desde el inicio).
  const nextOpen = (from: number, closed: (it: Item) => boolean) => {
    for (let k = 1; k <= items.length; k++) {
      const j = (from + k) % items.length;
      if (!closed(items[j])) return j;
    }
    return null;
  };
  const upcoming = nextOpen(idx, isClosed);

  const goTo = (j: number) => {
    setIdx(j);
    setNote(null);
    setPhase('work');
    setRestEndsAt(null);
    setAdjusting(false);
    setPainOpen(false);
    setPain(null);
    setRpe(null);
    setTechniqueOk(false);
    setPainSheet(null);
    setPainAsked(false);
    setCantDoSheet(null);
  };

  const advance = (nextLogs: typeof logs, nextSkipped = skipped) => {
    const closed = (it: Item) =>
      nextLogs.filter((l) => l.itemKey === it.key).length >= it.slot.sets || nextSkipped.includes(it.key);
    const j = nextOpen(idx, closed);
    if (j == null || closed(items[j])) finish(nextLogs);
    else goTo(j);
  };

  const logFor = (setNo: number, painLevel: PainLevel | null): SetLog & { itemKey: string } => ({
    itemKey: item.key,
    exerciseId: item.slot.exerciseId,
    setNo,
    targetReps: item.slot.reps,
    repsDone: timed ? null : reps,
    durationSec: timed ? seconds : null,
    weightKg: usesKb ? weight : null,
    plannedWeightKg: usesKb ? item.slot.weightKg : null,
    rpe: null,
    painFlag: (painLevel ?? 0) >= 2,
    painLevel,
  });

  const markDone = () => {
    markTimes.current.push(now);
    // Tocar «Hecha» durante el descanso lo termina y registra la serie siguiente.
    setRestEndsAt(null);
    if (phase === 'rest') setPhase('work');
    // Calentamiento, movilidad y elongación: cada toque registra una serie, sin pregunta de
    // esfuerzo; recién con la última pasa al ejercicio siguiente.
    if (kind === 'none') {
      const nextLogs = [...logs, logFor(done + 1, painHere(pain) || pain)];
      setLogs(nextLogs);
      if (done + 1 < item.slot.sets) {
        setNote(`Serie ${done + 1} lista. Vamos con la ${done + 2} de ${item.slot.sets}.`);
        if (item.slot.restSec > 0) {
          lastCount.current = null;
          setRestEndsAt(now + item.slot.restSec * 1000);
          setPainAsked(true);
          setPhase('rest');
        }
      } else advance(nextLogs);
      return;
    }
    const nextLogs = [...logs, logFor(done + 1, null)];
    setLogs(nextLogs);
    setAdjusting(false);
    if (done + 1 < item.slot.sets) {
      if (item.slot.restSec > 0) {
        lastCount.current = null;
        setRestEndsAt(now + item.slot.restSec * 1000);
        setPainAsked(false);
        setPhase('rest');
        cues.play('rest');
      }
    } else setPhase('feedback');
  };

  // Esfuerzo y dolor, una sola vez por ejercicio: se guardan en sus series.
  const confirmFeedback = (endNow = false) => {
    const level = painHere(pain);
    const nextLogs = logs.map((l) =>
      l.itemKey === item.key
        ? {
            ...l,
            rpe,
            painLevel: level || pain,
            painFlag: level >= 2,
            ...(item.slot.role === 'A' ? { techniqueOk } : {}),
          }
        : l,
    );
    setLogs(nextLogs);
    if (endNow) finish(nextLogs);
    else advance(nextLogs);
  };

  // Alternativa más suave para el mismo bloque y los mismos grupos musculares.
  const findAlternative = () => {
    if (!ex || !profile) return null;
    const inDay = new Set(items.map((i) => i.slot.exerciseId));
    const pool = filterExercisesForUser(
      EXERCISES,
      { ...profile, equipment: equipmentAt(dayPlan.location, profile) },
      item.block,
    ).filter(
      (e) =>
        !inDay.has(e.id) &&
        isGentle(e) &&
        e.complexityLevel <= ex.complexityLevel &&
        e.muscleGroups.some((g) => ex.muscleGroups.includes(g)),
    );
    pool.sort(
      (a, b) =>
        Number(b.movementPattern === ex.movementPattern) - Number(a.movementPattern === ex.movementPattern) ||
        a.complexityLevel - b.complexityLevel,
    );
    return pool[0] ?? null;
  };

  const choosePain = (level: PainLevel) => {
    setItemPain((p) => ({ ...p, [item.key]: Math.max(level, p[item.key] ?? 0) as PainLevel }));
    setPainSheet(level === 0 ? null : level);
  };

  const lighten = () => {
    const lower = owned.filter((w) => w < (weight ?? 0)).sort((a, b) => b - a)[0];
    if (usesKb && lower) setOv({ weight: lower });
    else if (timed) setOv({ seconds: Math.max(10, seconds - 10) });
    else setOv({ reps: Math.max(1, reps - 2) });
    setPainSheet(null);
  };

  const swap = () => {
    const alt = findAlternative();
    if (!alt) return;
    const p = alt.prescription;
    const altWeights = profile ? weightsFor(alt, profile) : [];
    const lower = altWeights.filter((w) => w < (weight ?? Infinity)).sort((a, b) => b - a)[0] ?? altWeights[0] ?? null;
    const replacement: Item = {
      key: `${item.key}-alt`,
      block: item.block,
      slot: {
        exerciseId: alt.id,
        sets: Math.max(1, item.slot.sets - done),
        reps: p.repRange?.min ?? null,
        durationSec: p.durationSec,
        weightKg: alt.equipment.required.includes('kettlebell') ? lower : null,
        restSec: p.restSec,
        rationale: 'Cambio por dolor.',
      },
    };
    // El dolor queda anotado en las series ya hechas del ejercicio original.
    const level = itemPain[item.key] ?? 0;
    setLogs((ls) => ls.map((l) => (l.itemKey === item.key ? { ...l, painLevel: level, painFlag: level >= 2 } : l)));
    setReplacements((r) => ({ ...r, [item.key]: replacement }));
    setSkipped((sk) => [...sk, item.key]);
    goTo(idx + 1);
  };

  const skip = () => {
    const nextSkipped = [...skipped, item.key];
    setSkipped(nextSkipped);
    advance(logs, nextSkipped);
  };

  // «No puedo hacerlo»: uno parecido y más simple, que se pueda hacer aquí y que no esté ya en el día.
  const cantDoAlt =
    cantDoSheet && cantDoSheet !== 'ask' && ex && profile
      ? easierAlternative(ex, item.block, {
          profile,
          exercises: EXERCISES,
          location: dayPlan.location,
          used: new Set(items.map((i) => i.slot.exerciseId)),
          history: sessions,
        })
      : null;
  const markCantDo = (reason: CantDoReason, replacedBy: string | null) => {
    const id = item.slot.exerciseId;
    cantDo.current = [...cantDo.current.filter((c) => c.exerciseId !== id), { exerciseId: id, reason, replacedBy }];
  };
  const swapCantDo = () => {
    if (!profile || !cantDoAlt || !cantDoSheet || cantDoSheet === 'ask') return;
    markCantDo(cantDoSheet, cantDoAlt.id);
    const replacement: Item = {
      key: `${item.key}-alt`,
      block: item.block,
      slot: replacementSlot(cantDoAlt, item.slot, item.slot.sets - done, item.block, profile),
    };
    setReplacements((r) => ({ ...r, [item.key]: replacement }));
    setSkipped((sk) => [...sk, item.key]);
    goTo(idx + 1);
  };
  // Lo hace modificado: sigue el mismo ejercicio, con la indicación a la vista.
  const modifyCantDo = () => {
    setModifiedKeys((k) => (k.includes(item.key) ? k : [...k, item.key]));
    setCantDoSheet(null);
  };
  const skipCantDo = () => {
    if (cantDoSheet && cantDoSheet !== 'ask') markCantDo(cantDoSheet, null);
    setCantDoSheet(null);
    skip();
  };

  // Bloque C sin empezar: se puede cerrar con un circuito HIIT o un desafío AMRAP.
  const pendingC = items.filter(
    (it) => it.block === 'main_strength' && it.slot.role === 'C' && !isClosed(it) && setsDone(it.key) === 0,
  );
  const offer =
    profile && phase === 'work' && allowsFinisher(checkIn) && pendingC.some((it) => it.key === item.key)
      ? finisherOffer({
          slots: pendingC,
          dayExerciseIds: items.map((it) => it.slot.exerciseId),
          location: dayPlan.location,
          profile,
          exercises: EXERCISES,
          history: sessions,
          cycle: cycleInfo(sessions, profile.level, week.days),
          advice: dayPlan.finisher,
        })
      : null;

  const pickClosing = (format: 'hiit' | 'amrap') => offer && setClosing({ format, offer });

  // HIIT y AMRAP se registran como series aparte: no suben cargas, pero su dolor cuenta.
  const saveClosing = (
    format: 'hiit' | 'amrap',
    sets: { exercise: FinisherExercise; setNo: number; reps: number | null; seconds: number | null }[],
    feedback: FinisherFeedbackResult,
  ) => {
    const newLogs = sets.map(({ exercise, setNo, reps: repsDone, seconds: durationSec }) => {
      const hurt = exercise.exerciseId === feedback.painExerciseId;
      const level = hurt ? (feedback.pain ?? 0) : 0;
      return {
        itemKey: exercise.key,
        exerciseId: exercise.exerciseId,
        setNo,
        targetReps: null,
        repsDone,
        durationSec,
        weightKg: exercise.weightKg,
        rpe: feedback.rpe,
        painFlag: level >= 2,
        painLevel: level,
        painSide: hurt ? feedback.painSide : null,
        format,
      };
    });
    const nextLogs = [...logs, ...newLogs];
    const nextSkipped = [...skipped, ...(closing?.offer.hiit.exercises.map((e) => e.key) ?? [])];
    setLogs(nextLogs);
    setSkipped(nextSkipped);
    setClosing(null);
    advance(nextLogs, nextSkipped);
  };

  const finishHiit = (result: HiitResult) => {
    const workSec = closing?.offer.hiit.config.workSec ?? null;
    const sets = result.sets.map(({ exercise, round }) => ({ exercise, setNo: round, reps: null, seconds: workSec }));
    saveClosing('hiit', sets, result);
  };

  const finishAmrap = (result: AmrapResult) => {
    const amrap = closing?.offer.amrap;
    if (!amrap) return;
    amrapResult.current = {
      exerciseIds: amrap.exercises.map((e) => e.exerciseId),
      minutes: amrap.minutes,
      rounds: result.rounds,
      extraReps: result.extraReps,
    };
    // La ronda incompleta queda en la marca; en las series van las rondas completas.
    const sets = Array.from({ length: Math.max(1, result.rounds) }, (_, i) =>
      amrap.exercises
        .slice(0, result.rounds ? undefined : 1)
        .map((exercise) => ({ exercise, setNo: i + 1, reps: exercise.reps, seconds: exercise.seconds })),
    ).flat();
    saveClosing('amrap', sets, result);
  };

  if (closing?.format === 'hiit') {
    return (
      <HiitBlock
        offer={closing.offer.hiit}
        // La razón es la del cierre sugerido: si la persona eligió el otro, no se muestra.
        reason={closing.offer.suggested === closing.format ? closing.offer.reason : null}
        cues={cues}
        onFinish={finishHiit}
        onCancel={() => setClosing(null)}
        topInset={insets.top}
        bottomInset={insets.bottom}
      />
    );
  }

  if (closing?.format === 'amrap') {
    return (
      <AmrapBlock
        offer={closing.offer.amrap}
        // La razón es la del cierre sugerido: si la persona eligió el otro, no se muestra.
        reason={closing.offer.suggested === closing.format ? closing.offer.reason : null}
        cues={cues}
        onFinish={finishAmrap}
        onCancel={() => setClosing(null)}
        topInset={insets.top}
        bottomInset={insets.bottom}
      />
    );
  }

  // A un lado: «8 con cada pierna». Alternado: «8 en total» y abajo cuánto va con cada brazo.
  const side = sideLabel(item.slot.exerciseId, timed);
  const split = timed ? null : alternatingSplit(item.slot.exerciseId, reps);
  const target = timed ? `${seconds} s${side ? ` ${side}` : ''}` : side ? `${reps} ${side}` : `${reps} reps`;
  const position = items.filter(isClosed).length + 1;
  const barOpen = confirmEnd || phase === 'rest' || painSheet != null || cantDoSheet != null;
  const clockSize =
    barOpen || phase === 'feedback' ? CLOCK_SMALL : screenHeight < COMPACT_HEIGHT ? CLOCK_MEDIUM : CLOCK_LARGE;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      {/* Guarda lo registrado tras cada serie, para poder retomar si el sistema cierra la app. */}
      <DraftSaver
        snapshot={{
          v: 1,
          day,
          location: dayPlan.location,
          startedAt,
          planGeneratedAt: plan?.generatedAt ?? null,
          totalSets,
          logs,
          idx,
          feedback: phase === 'feedback',
          checkIn,
          overrides,
          skipped,
          itemPain,
          painSides,
          replacements,
          modifiedKeys,
          modifiedIds: items.filter((it) => modifiedKeys.includes(it.key)).map((it) => it.slot.exerciseId),
          closingDismissed,
        }}
        cantDo={cantDo}
        amrap={amrapResult}
        markTimes={markTimes}
      />

      <View style={styles.top}>
        <Pressable onPress={() => setConfirmEnd(true)} hitSlop={12} accessibilityLabel="Terminar">
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.topTitle}>{DAY_LONG[day]}</Text>
          <Text style={styles.topSub}>
            {fmtClock((now - startedAt) / 1000)} · {Math.min(logs.length, totalSets)}/{totalSets} series
          </Text>
        </View>
        <View style={styles.topRight}>
          <Pressable onPress={() => setShowAll(!showAll)} hitSlop={10} accessibilityLabel="Ver todos">
            <Ionicons name={showAll ? 'barbell-outline' : 'list'} size={26} color={colors.text} />
          </Pressable>
          <Link href="/timer" asChild>
            <Pressable hitSlop={10} style={{ alignItems: 'center' }} accessibilityLabel="Tabata/HIIT">
              <Ionicons name="timer-outline" size={26} color={colors.accent} />
            </Pressable>
          </Link>
        </View>
      </View>

      {showAll ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
          <Text style={styles.hint}>Toca un ejercicio para hacerlo ahora.</Text>
          {todayPlan.blocks.map((block) => (
            <View key={block.type} style={{ gap: spacing.sm }}>
              <Text style={styles.blockTitle}>{BLOCK_LABELS[block.type]}</Text>
              {items
                .map((it, j) => ({ it, j }))
                .filter(({ it }) => it.block === block.type)
                .map(({ it, j }) => {
                  const n = setsDone(it.key);
                  const complete = isComplete(it);
                  return (
                    <Pressable
                      key={it.key}
                      onPress={() => {
                        goTo(j);
                        setShowAll(false);
                      }}
                      style={[styles.row, complete && { opacity: 0.55 }, j === idx && styles.rowCurrent]}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.rowName}>{exName(it.slot.exerciseId)}</Text>
                        <Text style={styles.rowRx}>{slotLabel(it.slot)}</Text>
                      </View>
                      {complete ? (
                        <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
                      ) : (
                        <Text style={styles.rowCount}>
                          {skipped.includes(it.key) ? 'Saltado' : `${n}/${it.slot.sets}`}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
            </View>
          ))}
          <Button label="Terminar entrenamiento" variant="ghost" onPress={() => setConfirmEnd(true)} />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            styles.contentFill,
            { paddingBottom: insets.bottom + (barOpen ? BOTTOM_BAR_SPACE : spacing.lg) },
          ]}
        >
          <Text style={styles.blockTitle}>
            {BLOCK_LABELS[item.block]} · ejercicio {Math.min(position, items.length)} de {items.length}
          </Text>
          <Text style={styles.exName}>{ex?.name.es ?? item.slot.exerciseId}</Text>
          {ex && item.block === 'main_strength' && <Text style={styles.hint}>{strengthInfo(ex)}</Text>}
          {note && <Text style={styles.checkInNote}>{note}</Text>}

          {ex && (
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
          )}

          {offer && !closingDismissed && (
            <ClosingCard
              offer={offer}
              byAi={!!dayPlan.finisher}
              onPick={pickClosing}
              onNormal={() => setClosingDismissed(true)}
            />
          )}

          {phase === 'feedback' ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>¡Listo! {EFFORT_QUESTION[kind === 'hold' ? 'hold' : 'reps']}</Text>
              <View style={styles.chips}>
                {EFFORT_OPTIONS[kind === 'hold' ? 'hold' : 'reps'].map((o) => (
                  <Pressable
                    key={o.rpe}
                    onPress={() => setRpe(rpe === o.rpe ? null : o.rpe)}
                    style={[styles.chip, rpe === o.rpe && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, rpe === o.rpe && { color: colors.onAccent }]}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>
              {usesKb && kind === 'reps' && (
                <Text style={styles.hint}>¿Quedó muy pesado? Marca «Ninguna» y no subiremos el peso.</Text>
              )}
              {item.slot.role === 'A' && (
                <CheckRow
                  label="Pude mantener la técnica"
                  checked={techniqueOk}
                  onPress={() => setTechniqueOk(!techniqueOk)}
                />
              )}
              <PainPicker
                open={painOpen || hasConditions}
                onOpen={() => setPainOpen(true)}
                pain={pain}
                onPain={setPain}
              />
              {askSide && (pain ?? 0) > 0 && <SidePicker side={painSide} onSide={setPainSide} />}
              <Button label={upcoming == null ? 'Terminar' : 'Continuar'} onPress={() => confirmFeedback()} />
              {pain === 3 && upcoming != null && (
                <Button label="Terminar por hoy" variant="ghost" onPress={() => confirmFeedback(true)} />
              )}
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.setLabel}>
                {kind === 'none' && item.slot.sets === 1
                  ? 'Una vez'
                  : `Serie ${Math.min(done + 1, item.slot.sets)} de ${item.slot.sets}`}
              </Text>
              {item.slot.sets > 1 && (
                <View style={styles.setDots} accessibilityLabel={`${done} de ${item.slot.sets} series hechas`}>
                  {Array.from({ length: item.slot.sets }, (_, i) => (
                    <View
                      key={i}
                      style={[styles.setDot, i < done && styles.setDotDone, i === done && styles.setDotNow]}
                    />
                  ))}
                </View>
              )}
              <Text style={styles.target}>
                {target}
                {usesKb && weight ? ` · ${weightLabel(item.slot.exerciseId, weight)}` : ''}
              </Text>
              {split && <Text style={styles.sideHint}>Alternando: {split}.</Text>}
              {ex && modifiedKeys.includes(item.key) && (
                <Text style={styles.modNote}>Modificado: {modificationFor(ex)}</Text>
              )}
              {isPerSide(item.slot.exerciseId) && (
                <Text style={styles.sideHint}>
                  Termina un lado, cambia y marca «{kind === 'none' ? 'Hecho' : 'Hecha'}» al final.
                </Text>
              )}

              {adjusting && (
                <View style={{ gap: spacing.sm }}>
                  <View style={styles.logRow}>
                    <Text style={styles.label}>
                      {timed ? 'Segundos' : 'Repeticiones'}
                      {side ? ` ${side}` : ''}
                    </Text>
                    {timed ? (
                      <Stepper
                        value={seconds}
                        min={5}
                        max={600}
                        step={5}
                        suffix="s"
                        onChange={(v) => setOv({ seconds: v })}
                      />
                    ) : (
                      <Stepper
                        value={reps}
                        min={0}
                        max={100}
                        step={split ? 2 : 1}
                        onChange={(v) => setOv({ reps: v })}
                      />
                    )}
                  </View>
                  {usesKb && (
                    <View style={styles.logRow}>
                      <Text style={styles.label}>
                        {loadCount(item.slot.exerciseId) === 2
                          ? ex?.dumbbellGuide
                            ? 'Peso de cada mancuerna (kg)'
                            : 'Peso de cada una (kg)'
                          : 'Peso (kg)'}
                      </Text>
                      <View style={styles.chips}>
                        {owned.map((kg) => (
                          <Pressable
                            key={kg}
                            onPress={() => setOv({ weight: kg })}
                            style={[styles.chip, weight === kg && styles.chipOn]}
                          >
                            <Text style={[styles.chipText, weight === kg && { color: colors.onAccent }]}>{kg}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {kind === 'none' && (
                <PainPicker
                  open={painOpen || hasConditions}
                  onOpen={() => setPainOpen(true)}
                  pain={pain}
                  onPain={setPain}
                />
              )}
              {kind === 'none' && askSide && (pain ?? 0) > 0 && <SidePicker side={painSide} onSide={setPainSide} />}

              <Pressable onPress={markDone} style={styles.doneBtn}>
                <Ionicons name="checkmark" size={28} color={colors.onAccent} />
                <Text style={styles.doneText}>{kind === 'none' ? 'Hecho' : 'Hecha'}</Text>
              </Pressable>

              <View style={styles.links}>
                <Pressable onPress={() => setAdjusting(!adjusting)} hitSlop={8}>
                  <Text style={styles.smallLink}>{adjusting ? 'Listo' : 'Ajustar'}</Text>
                </Pressable>
                {hasConditions && kind !== 'none' && (
                  <Pressable onPress={() => setPainSheet('levels')} hitSlop={8}>
                    <Text style={styles.smallLinkWarn}>¿Duele?</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    setPainSheet(null);
                    setCantDoSheet('ask');
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.smallLink}>No puedo hacerlo</Text>
                </Pressable>
                <Pressable onPress={skip} hitSlop={8}>
                  <Text style={styles.smallLinkMuted}>Saltar ejercicio</Text>
                </Pressable>
              </View>
            </View>
          )}

          {upcoming != null && phase !== 'feedback' && (
            <Text style={styles.next}>A continuación: {exName(items[upcoming].slot.exerciseId)}</Text>
          )}

          {/* Usa solo el espacio libre; con descanso o preguntas se achica para no competir con ellos. */}
          <View style={styles.clockArea}>
            <Text
              style={[
                styles.clock,
                fontsLoaded && { fontFamily: 'BebasNeue_400Regular' },
                { fontSize: clockSize, lineHeight: clockSize * 1.05 },
              ]}
            >
              {fmtClock((now - startedAt) / 1000)}
            </Text>
            <Text style={styles.clockLabel}>Tiempo de entrenamiento</Text>
          </View>
        </ScrollView>
      )}

      {/* Barra inferior: descanso automático o confirmación de término */}
      {barOpen && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
          {cantDoSheet != null && !confirmEnd ? (
            <CantDoSheet
              reason={cantDoSheet === 'ask' ? null : cantDoSheet}
              modification={ex ? modificationFor(ex) : ''}
              altName={cantDoAlt?.name.es ?? null}
              onReason={setCantDoSheet}
              onModify={modifyCantDo}
              onSwap={swapCantDo}
              onSkip={skipCantDo}
              onClose={() => setCantDoSheet(null)}
            />
          ) : painSheet != null && !confirmEnd ? (
            <PainSheet
              sheet={painSheet}
              sidePicker={askSide ? <SidePicker side={painSide} onSide={setPainSide} /> : null}
              canSwap={findAlternative() != null}
              onLevel={choosePain}
              onLighten={lighten}
              onSwap={swap}
              onStop={() => {
                setPainSheet(null);
                skip();
              }}
              onEndToday={() => {
                setPainSheet(null);
                setConfirmEnd(true);
              }}
              onClose={() => setPainSheet(null)}
            />
          ) : confirmEnd ? (
            <>
              <Text style={styles.barTitle}>¿Terminar el entrenamiento?</Text>
              <Text style={styles.hint}>
                {logs.length
                  ? `Se guardan las ${logs.length} series registradas.`
                  : 'No has registrado series; no se guardará nada.'}
              </Text>
              <Button label="Sí, terminar" onPress={() => finish()} />
              <Button label="Seguir entrenando" variant="ghost" onPress={() => setConfirmEnd(false)} />
            </>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {hasConditions && !painAsked && (
                <View style={styles.askRow}>
                  <Text style={styles.askText}>¿Te dolió esa serie?</Text>
                  <Pressable onPress={() => setPainAsked(true)} style={styles.restBtn}>
                    <Text style={styles.restBtnText}>No</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setPainAsked(true);
                      setPainSheet('levels');
                    }}
                    style={[styles.restBtn, { backgroundColor: colors.warning }]}
                  >
                    <Text style={[styles.restBtnText, { color: colors.bg }]}>Sí</Text>
                  </Pressable>
                </View>
              )}
              <View style={styles.restRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.restLabel}>Descanso · luego serie {done + 1}</Text>
                  <Text style={styles.restTime}>{fmtClock(Math.max(0, restLeft ?? 0))}</Text>
                </View>
                <Pressable
                  onPress={toggleTick}
                  style={styles.restBtn}
                  accessibilityLabel={tickOn ? 'Apagar el tic-tac del descanso' : 'Encender el tic-tac del descanso'}
                  hitSlop={6}
                >
                  <Ionicons name={tickOn ? 'volume-high' : 'volume-mute'} size={20} color={colors.text} />
                </Pressable>
                <Pressable onPress={() => setRestEndsAt((t) => (t ?? Date.now()) + 15000)} style={styles.restBtn}>
                  <Text style={styles.restBtnText}>+15 s</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setRestEndsAt(null);
                    setPhase('work');
                  }}
                  style={styles.restBtn}
                >
                  <Text style={styles.restBtnText}>Saltar</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// Qué hacer cuando duele, con una lesión conocida: cambiar, aliviar o parar.
function PainSheet({
  sheet,
  sidePicker,
  canSwap,
  onLevel,
  onLighten,
  onSwap,
  onStop,
  onEndToday,
  onClose,
}: {
  sheet: 'levels' | PainLevel;
  sidePicker: ReactNode;
  canSwap: boolean;
  onLevel: (l: PainLevel) => void;
  onLighten: () => void;
  onSwap: () => void;
  onStop: () => void;
  onEndToday: () => void;
  onClose: () => void;
}) {
  if (sheet === 'levels')
    return (
      <>
        <Text style={styles.barTitle}>¿Cuánto duele?</Text>
        <View style={styles.chips}>
          {PAIN_OPTIONS.filter((o) => o.level > 0).map((o) => (
            <Pressable key={o.level} onPress={() => onLevel(o.level)} style={[styles.chip, styles.painOn]}>
              <Text style={[styles.chipText, { color: colors.bg }]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        <Button label="No duele" variant="ghost" onPress={onClose} />
      </>
    );
  if (sheet === 1)
    return (
      <>
        <Text style={styles.barTitle}>Molestia leve: anotada</Text>
        <Text style={styles.hint}>Puedes seguir con cuidado. Tu próxima semana mantendrá la carga, sin subirla.</Text>
        {sidePicker}
        <Button label="Seguir" onPress={onClose} />
        <Button label="Hacerlo más liviano" variant="ghost" onPress={onLighten} />
      </>
    );
  if (sheet === 2)
    return (
      <>
        <Text style={styles.barTitle}>Cambiemos algo para que no duela</Text>
        <Text style={styles.hint}>No sigas igual: alivia el ejercicio o cámbialo por uno más suave.</Text>
        {sidePicker}
        {canSwap && <Button label="Cambiar por uno más suave" onPress={onSwap} />}
        <Button label="Seguir más liviano" variant={canSwap ? 'ghost' : 'primary'} onPress={onLighten} />
        <Button label="Parar este ejercicio" variant="ghost" onPress={onStop} />
      </>
    );
  return (
    <>
      <Text style={styles.barTitle}>Para este ejercicio</Text>
      <Text style={styles.hint}>
        Con dolor fuerte no conviene seguir. Si el dolor sigue, termina por hoy; si se repite, consulta a un
        profesional.
      </Text>
      {sidePicker}
      <Button label="Terminar por hoy" onPress={onEndToday} />
      {canSwap && <Button label="Cambiar por uno más suave" variant="ghost" onPress={onSwap} />}
      <Button label="Parar solo este ejercicio" variant="ghost" onPress={onStop} />
    </>
  );
}

// «No puedo hacerlo»: primero el motivo; después, hacerlo modificado (se mantiene el ejercicio),
// cambiarlo por uno más simple o saltarlo.
function CantDoSheet({
  reason,
  modification,
  altName,
  onReason,
  onModify,
  onSwap,
  onSkip,
  onClose,
}: {
  reason: CantDoReason | null;
  modification: string;
  altName: string | null;
  onReason: (r: CantDoReason) => void;
  onModify: () => void;
  onSwap: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  if (!reason)
    return (
      <>
        <Text style={styles.barTitle}>¿Qué pasa con este ejercicio?</Text>
        <View style={styles.chips}>
          {CANT_DO_OPTIONS.map((o) => (
            <Pressable key={o.id} onPress={() => onReason(o.id)} style={styles.chip}>
              <Text style={styles.chipText}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        <Button label="Volver" variant="ghost" onPress={onClose} />
      </>
    );
  return (
    <>
      <Text style={styles.barTitle}>Hazlo más fácil</Text>
      <Text style={styles.modText}>{modification}</Text>
      <Button label="Lo hago así" onPress={onModify} />
      <Text style={styles.hint}>
        {altName ? `O cámbialo por ${altName}, parecido y más simple. ` : ''}
        Si lo cambias o lo saltas, no te lo volveremos a proponer en las próximas 4 semanas.
      </Text>
      {altName && <Button label="Cambiarlo" variant="ghost" onPress={onSwap} />}
      <Button label="Saltarlo por hoy" variant="ghost" onPress={onSkip} />
      <Button label="Volver" variant="ghost" onPress={onClose} />
    </>
  );
}

const FORMAT_NAME = { hiit: 'HIIT', amrap: 'AMRAP' } as const;

// Cierre del bloque C: la sugerencia como opción principal, la otra más discreta y un
// botón propio para seguir normal (no se confunde con «Hecha», que registra una serie).
function ClosingCard({
  offer,
  byAi,
  onPick,
  onNormal,
}: {
  offer: FinisherOffer;
  byAi: boolean;
  onPick: (format: 'hiit' | 'amrap') => void;
  onNormal: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = {
    hiit: `Hacer HIIT · ≈ ${offer.hiit.minutes} min`,
    amrap: `Hacer AMRAP · ${offer.amrap.minutes} min`,
  };

  if (offer.suggested === 'normal' && !open) {
    return (
      <Pressable onPress={() => setOpen(true)} hitSlop={8}>
        <Text style={styles.smallLink}>Cambiar a HIIT o AMRAP ›</Text>
      </Pressable>
    );
  }

  const main = offer.suggested === 'normal' ? null : offer.suggested;
  const other = main === 'hiit' ? 'amrap' : 'hiit';
  return (
    <View style={styles.hiitCard}>
      <Text style={styles.panelTitle}>
        {main ? `${byAi ? 'La IA te sugiere' : 'Te sugerimos'} ${FORMAT_NAME[main]}` : '¿Cómo quieres cerrar?'}
      </Text>
      {main && <Text style={styles.hint}>{offer.reason}</Text>}
      {main ? (
        <>
          <Button label={label[main]} onPress={() => onPick(main)} />
          <Pressable onPress={() => onPick(other)} hitSlop={8}>
            <Text style={styles.smallLink}>Prefiero {FORMAT_NAME[other]}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Button label={label.hiit} variant="secondary" onPress={() => onPick('hiit')} />
          <Button label={label.amrap} variant="secondary" onPress={() => onPick('amrap')} />
        </>
      )}
      <Button label="Seguir con mi bloque normal" variant="ghost" onPress={onNormal} />
    </View>
  );
}

function Summary({
  logs,
  minutes,
  kcal,
  insets,
  feeling,
  onFeeling,
  cameTired,
  saveState,
  onSave,
  onDiscard,
}: {
  logs: SetLog[];
  minutes: number;
  kcal: string | null;
  insets: { top: number; bottom: number };
  feeling: Feeling | null;
  onFeeling: (f: Feeling) => void;
  cameTired: boolean;
  saveState: SaveState;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const insetsStyle = { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 };
  // Parece hecha sin querer: antes de guardar, se pregunta.
  if (typeof saveState === 'object' || saveState === 'discarded') {
    const asking = typeof saveState === 'object';
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={[styles.summary, insetsStyle]}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
        <Text style={styles.summaryTitle}>{asking ? '¿Guardamos esta sesión?' : 'No se guardó'}</Text>
        <Text style={styles.text}>
          {asking
            ? `${saveState.ask === 'short' ? 'Duró menos de 5 minutos' : 'Las series se marcaron muy seguidas'}. Si fue sin querer, no la guardes: así no cambia tu próxima semana.`
            : 'Esta sesión no cuenta para tu ciclo ni para tu próxima semana.'}
        </Text>
        {asking && <Button label="Sí, guardarla" onPress={onSave} />}
        {asking && <Button label="No guardar" variant="ghost" onPress={onDiscard} />}
        {!asking && <Button label="Volver" onPress={() => router.back()} />}
      </ScrollView>
    );
  }
  // A un lado, lo registrado es por lado: en total se hizo el doble.
  const doneReps = (l: SetLog) => (l.repsDone ?? 0) * (isPerSide(l.exerciseId) ? 2 : 1);
  const totalReps = logs.reduce((n, l) => n + doneReps(l), 0);
  const volume = logs.reduce((n, l) => n + doneReps(l) * (l.weightKg ?? 0) * loadCount(l.exerciseId), 0);
  // Reserva media solo de los ejercicios por repeticiones (en los de tiempo la escala es otra).
  const rpes = logs
    .filter((l) => {
      const e = EXERCISES_BY_ID.get(l.exerciseId);
      return e != null && effortKind(e) === 'reps';
    })
    .map((l) => l.rpe)
    .filter((v): v is number => v != null);
  const painIn = (level: PainLevel) => [
    ...new Set(
      logs
        .filter((l) => painOf(l) === level)
        .map((l) => `${exName(l.exerciseId)}${l.painSide ? SIDE_NOTE[l.painSide] : ''}`),
    ),
  ];
  const [mild, moderate, strong] = [painIn(1), painIn(2), painIn(3)];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={[styles.summary, insetsStyle]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <Text style={styles.summaryTitle}>{logs.length ? '¡Lo lograste! 💪' : 'Entrenamiento terminado'}</Text>
      {cameTired && <Text style={styles.text}>Llegaste cansado y lo hiciste igual. Bien hecho.</Text>}
      {logs.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>¿Cómo estuvo hoy?</Text>
          <View style={styles.chips}>
            {FEELING_OPTIONS.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => onFeeling(o.id)}
                style={[styles.chip, feeling === o.id && styles.chipOn]}
              >
                <Text style={[styles.chipText, feeling === o.id && { color: colors.onAccent }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          {feeling && <Text style={styles.hint}>{FEELING_NOTE[feeling]}</Text>}
        </View>
      )}
      {logs.length > 0 && (
        <View style={styles.statsGrid}>
          <Stat label="Minutos" value={String(minutes)} />
          <Stat
            label="Series"
            value={String(logs.filter((l) => (l.repsDone ?? 0) > 0 || (l.durationSec ?? 0) > 0).length)}
          />
          <Stat label="Repeticiones" value={String(totalReps)} />
          <Stat label="Kg movidos" value={volume ? volume.toLocaleString('es-CL') : '—'} />
          <Stat
            label="Reps de reserva"
            value={rpes.length ? (rpes.reduce((a, b) => a + (10 - b), 0) / rpes.length).toFixed(1) : '—'}
          />
        </View>
      )}
      {logs.length > 0 && kcal && <Text style={styles.text}>Gasto estimado: {kcal}</Text>}
      {strong.length > 0 && (
        <View style={styles.painBox}>
          <Text style={styles.painTitle}>Dolor fuerte en: {strong.join(', ')}</Text>
          <Text style={styles.text}>
            Te avisaremos para cambiar estos ejercicios por otros más suaves. Si el dolor sigue o se repite, consulta a
            un profesional.
          </Text>
        </View>
      )}
      {moderate.length > 0 && (
        <View style={styles.painBox}>
          <Text style={styles.painTitle}>Dolor moderado en: {moderate.join(', ')}</Text>
          <Text style={styles.text}>Tu próxima semana bajará la exigencia de estos ejercicios.</Text>
        </View>
      )}
      {mild.length > 0 && (
        <View style={styles.painBox}>
          <Text style={styles.painTitle}>Molestia leve en: {mild.join(', ')}</Text>
          <Text style={styles.text}>Tu próxima semana mantendrá la carga de estos ejercicios, sin subirla.</Text>
        </View>
      )}
      <Text style={styles.text}>
        {logs.length
          ? 'Tus series quedaron guardadas y se usarán para ajustar tu próxima semana.'
          : 'No se registró ninguna serie, así que no se guardó esta sesión.'}
      </Text>
      <Button label="Volver" onPress={() => router.back()} />
      {logs.length > 0 &&
        (confirmDiscard ? (
          <View style={styles.panel}>
            <Text style={styles.text}>
              ¿Borrar esta sesión? No contará para tu ciclo ni para tu próxima semana. No se puede deshacer.
            </Text>
            <Button label="Sí, no guardarla" variant="ghost" onPress={onDiscard} />
            <Button label="Mantenerla" variant="ghost" onPress={() => setConfirmDiscard(false)} />
          </View>
        ) : (
          <Pressable onPress={() => setConfirmDiscard(true)} hitSlop={8} style={{ alignSelf: 'center' }}>
            <Text style={styles.smallLinkMuted}>No guardar esta sesión</Text>
          </Pressable>
        ))}
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
  topRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  exName: { color: colors.text, fontSize: 26, fontWeight: '900' },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  panelTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  setLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  setDots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  setDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.textMuted },
  setDotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  setDotNow: { borderColor: colors.accent },
  sideHint: { color: colors.textMuted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  target: { color: colors.text, fontSize: 34, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'] },
  doneBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  doneText: { color: colors.onAccent, fontSize: 20, fontWeight: '900' },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  smallLink: { color: colors.link, fontWeight: '700', fontSize: 14 },
  smallLinkWarn: { color: colors.warning, fontWeight: '700', fontSize: 14 },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  askText: { flex: 1, color: colors.text, fontWeight: '700' },
  smallLinkMuted: { color: colors.textMuted, fontWeight: '700', fontSize: 14 },
  next: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowCurrent: { borderWidth: 1, borderColor: colors.accent },
  rowName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowRx: { color: colors.textMuted, fontSize: 13 },
  rowCount: { color: colors.textMuted, fontWeight: '700' },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  text: { color: colors.text, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  modText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  modNote: { color: colors.accent, fontSize: 14, lineHeight: 19, textAlign: 'center', fontWeight: '600' },
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
  contentFill: { flexGrow: 1 },
  clockArea: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  clock: { color: colors.text, fontWeight: '400', fontVariant: ['tabular-nums'] },
  clockLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
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
  link: { color: colors.link, fontWeight: '700', marginTop: 4 },
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
  hiitCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
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
  checkInNote: { color: colors.accent, fontSize: 15, fontWeight: '700', lineHeight: 21 },
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
