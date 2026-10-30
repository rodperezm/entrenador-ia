import Ionicons from '@expo/vector-icons/Ionicons';
import { useStayAwake } from '@/lib/useStayAwake';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BodyMap } from '@/components/BodyMap';
import { Button, Stepper } from '@/components/ui';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { averageMet, kcalRangeLabel, latestWeight } from '@/domain/calories';
import { equipmentAt } from '@/domain/catalog';
import { filterExercisesForUser } from '@/domain/filter';
import { isGentle } from '@/domain/generator';
import { EFFORT_OPTIONS, EFFORT_QUESTION, effortKind } from '@/domain/effort';
import { BLOCK_LABELS } from '@/domain/labels';
import { type BlockType, DayOfWeek, type ExerciseSlot, type PainLevel, painOf, type SetLog } from '@/domain/schema';
import { fmtClock } from '@/domain/session';
import { DAY_LONG } from '@/domain/week';
import { slotLabel } from '@/features/planner/describe';
import { useCues } from '@/features/workout/useCues';
import { useBody } from '@/state/body';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

const PAIN_OPTIONS: { label: string; level: PainLevel }[] = [
  { label: 'Nada', level: 0 },
  { label: 'Leve', level: 1 },
  { label: 'Moderado', level: 2 },
  { label: 'Fuerte', level: 3 },
];
const exName = (id: string) => EXERCISES_BY_ID.get(id)?.name.es ?? id;

type Item = { key: string; block: BlockType; slot: ExerciseSlot };
type Phase = 'work' | 'rest' | 'feedback';
type Override = { reps?: number; seconds?: number; weight?: number | null };

// Entrenamiento guiado: un ejercicio a la vez. «✓ Hecha» registra lo planificado,
// el descanso arranca solo y al terminar las series se pregunta el esfuerzo una vez.
// «Ver todos» permite saltar a otro ejercicio para cambiar el orden.
export default function WorkoutScreen() {
  useStayAwake('workout');
  const insets = useSafeAreaInsets();
  const day = DayOfWeek.safeParse(useLocalSearchParams<{ day: string }>().day).data;
  const { plan } = usePlan();
  const { addSession } = useHistory();
  const { profile } = useProfile();
  const { records } = useBody();
  const dayPlan = plan?.days.find((d) => d.day === day);
  const cues = useCues(true);

  const [startedAt] = useState(() => Date.now());
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
  const [skipped, setSkipped] = useState<string[]>([]);
  // Dolor con lesión conocida: nivel por ejercicio, hoja de opciones y ejercicios cambiados.
  const [itemPain, setItemPain] = useState<Record<string, PainLevel>>({});
  const [painSheet, setPainSheet] = useState<'levels' | PainLevel | null>(null);
  const [painAsked, setPainAsked] = useState(false);
  const [replacements, setReplacements] = useState<Record<string, Item>>({});
  const [showAll, setShowAll] = useState(false);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const lastCount = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Descanso: pitidos en los últimos 3 segundos; al terminar vuelve solo a la siguiente serie.
  const restLeft = restEndsAt ? Math.ceil((restEndsAt - now) / 1000) : null;
  useEffect(() => {
    if (restLeft == null || restLeft === lastCount.current) return;
    const crossedZero = restLeft <= 0 && (lastCount.current ?? 1) > 0;
    lastCount.current = restLeft;
    if (crossedZero) {
      cues.play('work');
      setRestEndsAt(null);
      setPhase('work');
    } else if (restLeft > 0 && restLeft <= 3) cues.play('count');
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

  const items: Item[] = dayPlan.blocks.flatMap((b) =>
    b.slots.flatMap((slot, i) => {
      const it = { key: `${b.type}-${i}`, block: b.type, slot };
      // Un ejercicio cambiado por dolor queda cerrado y su reemplazo va justo después.
      return replacements[it.key] ? [it, replacements[it.key]] : [it];
    }),
  );
  const hasConditions = (profile?.conditions.length ?? 0) > 0;
  const totalSets = items.reduce((n, it) => n + it.slot.sets, 0);
  const setsDone = (key: string) => logs.filter((l) => l.itemKey === key).length;
  const isComplete = (it: Item) => setsDone(it.key) >= it.slot.sets;
  const isClosed = (it: Item) => isComplete(it) || skipped.includes(it.key);

  const finish = (doneLogs = logs) => {
    // El dolor marcado se guarda siempre: en las series hechas y, si el ejercicio
    // no alcanzó a tener series, como una serie sin repeticiones (para que la
    // próxima rutina lo cambie o lo alivie).
    const withPain = doneLogs.map((l) => {
      const level = Math.max(l.painLevel ?? 0, itemPain[l.itemKey] ?? 0) as PainLevel;
      return level ? { ...l, painLevel: level, painFlag: level >= 2 } : l;
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
          },
        ];
      });
    const allLogs = [...withPain, ...painOnly];
    setLogs(allLogs);
    const end = now;
    setFinishedAt(end);
    setRestEndsAt(null);
    if (allLogs.length === 0) return;
    cues.play('done');
    cues.say('¡Lo lograste!');
    addSession({
      id: `s${startedAt.toString(36)}`,
      day,
      location: dayPlan.location,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(end).toISOString(),
      completed: allLogs.length >= totalSets,
      sets: allLogs.map(({ itemKey: _k, ...l }) => l),
    });
  };

  if (finishedAt != null) {
    const minutes = Math.round((finishedAt - startedAt) / 60000);
    const weightKg = latestWeight(records);
    // Con el tiempo real de la sesión y la intensidad promedio de la rutina.
    const kcal =
      weightKg && dayPlan && minutes > 0
        ? kcalRangeLabel(averageMet(dayPlan.blocks, EXERCISES_BY_ID), weightKg, minutes)
        : null;
    return <Summary logs={logs} minutes={minutes} kcal={kcal} insets={insets} />;
  }

  const item = items[idx];
  const ex = EXERCISES_BY_ID.get(item.slot.exerciseId);
  // En calentamiento y elongación todo va de un toque, sin pregunta de esfuerzo.
  const kind = item.block === 'warmup' || item.block === 'cooldown' || !ex ? 'none' : effortKind(ex);
  const done = setsDone(item.key);
  const timed = item.slot.durationSec != null;
  const ov = overrides[item.key] ?? {};
  const reps = ov.reps ?? item.slot.reps ?? 0;
  const seconds = ov.seconds ?? item.slot.durationSec ?? 30;
  const owned = profile?.kettlebellWeightsKg ?? [];
  const usesKb = !!ex?.equipment.required.includes('kettlebell') && owned.length > 0;
  const weight = ov.weight !== undefined ? ov.weight : item.slot.weightKg;
  const painHere = (p: PainLevel | null) => Math.max(p ?? 0, itemPain[item.key] ?? 0) as PainLevel;
  const setOv = (patch: Override) => setOverrides((o) => ({ ...o, [item.key]: { ...o[item.key], ...patch } }));

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
    setPhase('work');
    setRestEndsAt(null);
    setAdjusting(false);
    setPainOpen(false);
    setPain(null);
    setRpe(null);
    setPainSheet(null);
    setPainAsked(false);
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
    rpe: null,
    painFlag: (painLevel ?? 0) >= 2,
    painLevel,
  });

  const markDone = () => {
    // Tocar «Hecha» durante el descanso lo termina y registra la serie siguiente.
    setRestEndsAt(null);
    if (phase === 'rest') setPhase('work');
    // Calentamiento, movilidad y elongación: un solo toque registra todas sus series.
    if (kind === 'none') {
      const rest = Array.from({ length: item.slot.sets - done }, (_, i) =>
        logFor(done + i + 1, painHere(pain) || pain),
      );
      const nextLogs = [...logs, ...rest];
      setLogs(nextLogs);
      advance(nextLogs);
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
      l.itemKey === item.key ? { ...l, rpe, painLevel: level || pain, painFlag: level >= 2 } : l,
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
    const lower = owned.filter((w) => w < (weight ?? Infinity)).sort((a, b) => b - a)[0] ?? owned[0] ?? null;
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

  const target = timed ? `${seconds} s` : `${reps} reps`;
  const position = items.filter(isClosed).length + 1;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <View style={styles.top}>
        <Pressable onPress={() => setConfirmEnd(true)} hitSlop={12} accessibilityLabel="Terminar">
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.topTitle}>{DAY_LONG[day]}</Text>
          <Text style={styles.topSub}>
            {fmtClock((now - startedAt) / 1000)} · {logs.length}/{totalSets} series
          </Text>
        </View>
        <View style={styles.topRight}>
          <Pressable onPress={() => setShowAll(!showAll)} hitSlop={10} accessibilityLabel="Ver todos">
            <Ionicons name={showAll ? 'barbell-outline' : 'list'} size={26} color={colors.text} />
          </Pressable>
          <Link href="/timer" asChild>
            <Pressable hitSlop={10} style={{ alignItems: 'center' }} accessibilityLabel="Tabata">
              <Ionicons name="timer-outline" size={26} color={colors.accent} />
            </Pressable>
          </Link>
        </View>
      </View>

      {showAll ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
          <Text style={styles.hint}>Toca un ejercicio para hacerlo ahora.</Text>
          {dayPlan.blocks.map((block) => (
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
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}>
          <Text style={styles.blockTitle}>
            {BLOCK_LABELS[item.block]} · ejercicio {Math.min(position, items.length)} de {items.length}
          </Text>
          <Text style={styles.exName}>{ex?.name.es ?? item.slot.exerciseId}</Text>

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
                    <Text style={[styles.chipText, rpe === o.rpe && { color: '#fff' }]}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>
              <PainPicker
                open={painOpen || hasConditions}
                onOpen={() => setPainOpen(true)}
                pain={pain}
                onPain={setPain}
              />
              <Button label={upcoming == null ? 'Terminar' : 'Continuar'} onPress={() => confirmFeedback()} />
              {pain === 3 && upcoming != null && (
                <Button label="Terminar por hoy" variant="ghost" onPress={() => confirmFeedback(true)} />
              )}
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.setLabel}>
                {kind === 'none'
                  ? item.slot.sets > 1
                    ? `${item.slot.sets} series`
                    : 'Una vez'
                  : `Serie ${Math.min(done + 1, item.slot.sets)} de ${item.slot.sets}`}
              </Text>
              <Text style={styles.target}>
                {target}
                {usesKb && weight ? ` · ${weight} kg` : ''}
              </Text>

              {adjusting && (
                <View style={{ gap: spacing.sm }}>
                  <View style={styles.logRow}>
                    <Text style={styles.label}>{timed ? 'Segundos' : 'Repeticiones'}</Text>
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
                      <Stepper value={reps} min={0} max={100} onChange={(v) => setOv({ reps: v })} />
                    )}
                  </View>
                  {usesKb && (
                    <View style={styles.logRow}>
                      <Text style={styles.label}>Peso (kg)</Text>
                      <View style={styles.chips}>
                        {owned.map((kg) => (
                          <Pressable
                            key={kg}
                            onPress={() => setOv({ weight: kg })}
                            style={[styles.chip, weight === kg && styles.chipOn]}
                          >
                            <Text style={[styles.chipText, weight === kg && { color: '#fff' }]}>{kg}</Text>
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

              <Pressable onPress={markDone} style={styles.doneBtn}>
                <Ionicons name="checkmark" size={28} color="#fff" />
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
                <Pressable onPress={skip} hitSlop={8}>
                  <Text style={styles.smallLinkMuted}>Saltar ejercicio</Text>
                </Pressable>
              </View>
            </View>
          )}

          {upcoming != null && phase !== 'feedback' && (
            <Text style={styles.next}>A continuación: {exName(items[upcoming].slot.exerciseId)}</Text>
          )}
        </ScrollView>
      )}

      {/* Barra inferior: descanso automático o confirmación de término */}
      {(confirmEnd || phase === 'rest' || painSheet != null) && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
          {painSheet != null && !confirmEnd ? (
            <PainSheet
              sheet={painSheet}
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
  canSwap,
  onLevel,
  onLighten,
  onSwap,
  onStop,
  onEndToday,
  onClose,
}: {
  sheet: 'levels' | PainLevel;
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
        <Text style={styles.hint}>Puedes seguir con cuidado. La próxima vez mantenemos la carga, sin subirla.</Text>
        <Button label="Seguir" onPress={onClose} />
        <Button label="Hacerlo más liviano" variant="ghost" onPress={onLighten} />
      </>
    );
  if (sheet === 2)
    return (
      <>
        <Text style={styles.barTitle}>Cambiemos algo para que no duela</Text>
        <Text style={styles.hint}>No sigas igual: alivia el ejercicio o cámbialo por uno más suave.</Text>
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
      <Button label="Terminar por hoy" onPress={onEndToday} />
      {canSwap && <Button label="Cambiar por uno más suave" variant="ghost" onPress={onSwap} />}
      <Button label="Parar solo este ejercicio" variant="ghost" onPress={onStop} />
    </>
  );
}

// «¿Algo dolió?» plegado: solo se abre si el usuario lo toca.
function PainPicker({
  open,
  onOpen,
  pain,
  onPain,
}: {
  open: boolean;
  onOpen: () => void;
  pain: PainLevel | null;
  onPain: (p: PainLevel | null) => void;
}) {
  if (!open)
    return (
      <Pressable onPress={onOpen} hitSlop={8}>
        <Text style={styles.smallLinkMuted}>¿Algo dolió?</Text>
      </Pressable>
    );
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.label}>¿Sentiste molestia o dolor?</Text>
      <View style={styles.chips}>
        {PAIN_OPTIONS.map((o) => {
          const on = pain === o.level;
          return (
            <Pressable
              key={o.level}
              onPress={() => onPain(on ? null : o.level)}
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
    </View>
  );
}

function Summary({
  logs,
  minutes,
  kcal,
  insets,
}: {
  logs: SetLog[];
  minutes: number;
  kcal: string | null;
  insets: { top: number; bottom: number };
}) {
  const totalReps = logs.reduce((n, l) => n + (l.repsDone ?? 0), 0);
  const volume = logs.reduce((n, l) => n + (l.repsDone ?? 0) * (l.weightKg ?? 0), 0);
  // Reserva media solo de los ejercicios por repeticiones (en los de tiempo la escala es otra).
  const rpes = logs
    .filter((l) => {
      const e = EXERCISES_BY_ID.get(l.exerciseId);
      return e != null && effortKind(e) === 'reps';
    })
    .map((l) => l.rpe)
    .filter((v): v is number => v != null);
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
  topRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  exName: { color: colors.text, fontSize: 26, fontWeight: '900' },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  panelTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  setLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
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
  doneText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  smallLink: { color: colors.accent, fontWeight: '700', fontSize: 14 },
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
