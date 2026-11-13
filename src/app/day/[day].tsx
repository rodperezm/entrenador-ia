import Ionicons from '@expo/vector-icons/Ionicons';
import { trainingStamp } from '@/domain/profileStamp';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { Fragment, type ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Button, Stepper } from '@/components/ui';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { averageMet, kcalRangeLabel, latestWeight } from '@/domain/calories';
import { cycleInfo } from '@/domain/cycle';
import { generateDayByRules, strongPainIds } from '@/domain/generator';
import { dayIntensity, strengthInfo, weekFocus } from '@/domain/strength';
import { explainDay } from '@/domain/explain';
import { supportNote } from '@/domain/coverage';
import { AiProgress } from '@/features/planner/AiProgress';
import { WhyDay } from '@/features/planner/WhyCards';
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from '@/domain/catalog';
import { BLOCK_LABELS, ROLE_LABELS } from '@/domain/labels';
import { type DayConfig, DayOfWeek, type DayPlan, type LocalProfile } from '@/domain/schema';
import { dayMinutes, leadPart, partCount, timeStatus } from '@/domain/timeBudget';
import {
  applyDayChoice,
  minutesRange,
  strengthLimitNote,
  toggleDayType,
  strengthDaysFull,
  weekChoicesOf,
  DAY_PARTS,
  configHash,
  dayConfigHash,
  dayHashes,
  DAYS,
  staleDays,
  DAY_LONG,
  DAY_TYPE_PARTS,
  dayDate,
  fmtDayDate,
  isFromPastWeek,
  isToday,
  dayChoiceLabel,
  dayChoiceOf,
  dayIncludedNote,
  dayPartLabel,
  sameChoice,
  withAutoCounts,
  withGentleStrength,
} from '@/domain/week';
import { slotLabel } from '@/features/planner/describe';
import { useGenerateWeek } from '@/features/planner/useGenerateWeek';
import { useBody } from '@/state/body';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

type Blocks = DayConfig['blocks'];

const STRENGTH_DAY = ['warmup', 'main', 'cooldown'] as const;

export default function DayScreen() {
  const params = useLocalSearchParams<{ day: string }>();
  const parsed = DayOfWeek.safeParse(params.day);
  const { week, plan, updateDay, savePlan } = usePlan();
  const { sessions } = useHistory();
  const { profile } = useProfile();
  const { records } = useBody();
  const { generate, generating, notice } = useGenerateWeek();
  // Ajustes en borrador: solo se guardan al confirmar «Rehacer con estos ajustes».
  const [draft, setDraft] = useState<DayConfig | null>(null);
  if (!parsed.success) return null;
  const day = parsed.data;
  const cfg = week.days.find((d) => d.day === day)!;

  const hasConditions = (profile?.conditions.length ?? 0) > 0;
  // Lo que se trabaja en Fuerza (y Lesión) este día: base de lo que prepara y estira cada ejercicio de apoyo.
  const slotsOf = (type: string) =>
    (plan?.days.find((p) => p.day === day)?.blocks.find((x) => x.type === type)?.slots ?? []).flatMap(
      (s) => EXERCISES_BY_ID.get(s.exerciseId) ?? [],
    );
  const dayMain = slotsOf('main_strength');
  const dayWorked = [...dayMain, ...slotsOf('prehab')];
  const today = isToday(day);
  const dayPlan = plan?.days.find((p) => p.day === day);
  const stale = !!plan && !!profile && staleDays(plan, week, trainingStamp(profile)).has(day);
  const painful = strongPainIds(sessions);
  const hasPainful = !!dayPlan?.blocks.some((b) => b.slots.some((s) => painful.includes(s.exerciseId)));
  // Semana vacía (perfil nuevo o recién borrado): conviene partir por la semana completa con IA.
  const weekEmpty = !plan?.days.some((p) => week.days.some((w) => w.day === p.day && w.active));
  const offerWeek = cfg.active && !dayPlan && weekEmpty && !draft;
  // Con la semana ya armada, un día de entrenamiento sin rutina abre los ajustes directamente.
  const editing = draft ?? (cfg.active && !dayPlan && !weekEmpty ? cfg : null);

  // Los otros días ya tienen Fuerza 6 veces: este no puede llevarla (la semana necesita un día libre).
  const strengthFull = strengthDaysFull(weekChoicesOf(week), day, profile?.level);
  const openAdjust = () =>
    setDraft(cfg.active ? cfg : applyDayChoice(cfg, strengthFull ? ['cooldown'] : [...STRENGTH_DAY]));
  const edit = (patch: (d: DayConfig) => DayConfig) => setDraft(patch(editing ?? cfg));
  const setBlock = <K extends keyof Blocks>(key: K, patch: Partial<Blocks[K]>) =>
    edit((d) => ({ ...d, blocks: { ...d.blocks, [key]: { ...d.blocks[key], ...patch } } }));

  // Vista previa de la duración mientras se ajusta; la semilla fija evita que salte al mover otros ajustes.
  const estimate =
    editing?.active && profile
      ? dayMinutes(generateDayByRules(editing, [], profile, EXERCISES, sessions, 1).blocks)
      : null;

  // Guarda los ajustes y rehace solo este día con las reglas de la app (instantáneo, sin costo de IA).
  const rebuild = async (next: DayConfig) => {
    if (!profile) return;
    updateDay(day, () => next);
    setDraft(null);
    if (!next.active) return;
    const nextWeek = { days: week.days.map((d) => (d.day === day ? next : d)) };
    const isActive = (d: DayOfWeek) => nextWeek.days.some((w) => w.day === d && w.active);
    // Incluye la rutina actual del día para que la nueva prefiera ejercicios distintos.
    const others = (plan?.days ?? []).filter((p) => isActive(p.day));
    const cycleBlock = cycleInfo(sessions, profile, week.days).blockStart;
    const locked =
      plan?.cycleBlock === cycleBlock && dayPlan?.location === next.location
        ? dayPlan.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots.map((s) => s.exerciseId))
        : [];
    const newDay = generateDayByRules(next, others, profile, EXERCISES, sessions, Date.now(), locked, nextWeek.days);
    const order = DAYS.map((d) => d.id);
    const days = [...(plan?.days ?? []).filter((p) => p.day !== day), newDay].sort(
      (a, b) => order.indexOf(a.day) - order.indexOf(b.day),
    );
    // Un plan antiguo sin huellas por día, si estaba al día, las hereda de la semana actual.
    const previousHashes =
      plan?.dayHashes ??
      (plan?.configHash === configHash(week, trainingStamp(profile)) ? dayHashes(week, trainingStamp(profile)) : {});
    await savePlan({
      days,
      summary: plan?.summary ?? 'Rutina armada día a día con las reglas de la app.',
      generatedAt: plan?.generatedAt ?? new Date().toISOString(),
      generator: plan?.generator ?? 'rules',
      configHash: plan?.configHash ?? configHash(nextWeek, trainingStamp(profile)),
      cycleBlock,
      dayHashes: { ...previousHashes, [day]: dayConfigHash(next, trainingStamp(profile), nextWeek) },
    });
  };

  const dismissTimeNotice = () => {
    if (!plan) return;
    savePlan({ ...plan, days: plan.days.map((p) => (p.day === day ? { ...p, timeNoticeDismissed: true } : p)) });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: DAY_LONG[day] }} />
      <Text style={[styles.date, today && { color: colors.accent }]}>
        {today ? 'Hoy · ' : ''}
        {DAY_LONG[day]} {fmtDayDate(dayDate(day))}
      </Text>

      {/* Lo normal es abrir el día para entrenar: primero la rutina. */}
      {offerWeek && (
        <>
          <Text style={[styles.section, { marginTop: 0 }]}>Rutina de este día</Text>
          <Text style={styles.muted}>
            Tu semana aún no tiene rutina. Lo mejor es armarla completa con IA: equilibra tus sesiones de cuerpo
            completo y varía los ejercicios entre días.
          </Text>
          <Button
            label={generating ? 'Armando tu semana…' : 'Generar mi semana con IA'}
            onPress={generate}
            disabled={generating}
          />
          <AiProgress active={generating} />
          {notice && <Text style={styles.stale}>{notice}</Text>}
          {!generating && <Button label="Armar solo este día" variant="ghost" onPress={() => setDraft(cfg)} />}
        </>
      )}

      {!cfg.active && !editing && (
        <>
          <Text style={[styles.section, { marginTop: 0 }]}>Día de descanso</Text>
          <Text style={styles.muted}>Recuperar también es parte del entrenamiento.</Text>
          <Button label="Entrenar este día" variant="ghost" onPress={openAdjust} />
        </>
      )}

      {cfg.active && dayPlan && (
        <>
          <Text style={[styles.section, { marginTop: 0 }]}>Rutina de este día</Text>
          {sameChoice(dayChoiceOf(cfg), ['cooldown']) && (
            <Text style={styles.muted}>{dayIncludedNote(['cooldown'])}</Text>
          )}
          {stale && !editing && (
            <Text style={styles.stale}>
              Este día o tu perfil cambiaron desde que se armó esta rutina. Toca «Rehacer o ajustar este día» para
              actualizarla.
            </Text>
          )}
          {hasPainful && !editing && (
            <Text style={styles.stale}>
              Marcaste dolor fuerte en un ejercicio de este día. Toca «Rehacer o ajustar este día» para cambiarlo.
            </Text>
          )}
          {!stale && plan && isFromPastWeek(plan.generatedAt) && (
            <Text style={styles.stale}>
              Esta rutina es de la semana pasada. Vuelve a Hoy para armar la nueva con lo que registraste.
            </Text>
          )}
          <TimeNotice
            dayPlan={dayPlan}
            cfg={cfg}
            weightKg={latestWeight(records)}
            onFit={() => rebuild({ ...withAutoCounts(cfg), fitToTime: true })}
            onFull={() => rebuild({ ...cfg, fitToTime: undefined })}
            onAddGentle={() => rebuild(withGentleStrength(cfg))}
            // La Lesión ya no se junta con la Fuerza en un mismo día: no se ofrece sumar fuerza suave.
            canAddStrength={false}
            onDismiss={dismissTimeNotice}
          />
          <Button
            label="Empezar entrenamiento"
            onPress={() => router.push({ pathname: '/workout/[day]', params: { day } })}
          />
          {profile && !editing && (
            <WhyDay
              lines={explainDay({
                dayPlan,
                cfg,
                profile,
                exercises: EXERCISES,
                intensity: cfg.blocks.main.enabled
                  ? cycleInfo(sessions, profile, week.days).preparation
                    ? 'light'
                    : dayIntensity(week.days, day, profile.level)
                  : null,
                focus: weekFocus(week.days)[day]?.focus,
              })}
            />
          )}
          {/* Qué prepara cada calentamiento y qué estira cada elongación, según la Fuerza del día. */}
          {dayPlan.blocks.map((b) => (
            <View key={b.type} style={styles.routineBlock}>
              <Text style={styles.routineTitle}>{BLOCK_LABELS[b.type]}</Text>
              {b.type === 'main_strength' && (
                <Text style={styles.muted}>Repites estos ejercicios durante el ciclo para medir tu progreso.</Text>
              )}
              {b.slots.map((s, i) => {
                const ex = EXERCISES_BY_ID.get(s.exerciseId);
                if (!ex) return null;
                return (
                  <Fragment key={i}>
                    {s.role && s.role !== b.slots[i - 1]?.role && (
                      <Text style={styles.roleTitle}>{ROLE_LABELS[s.role]}</Text>
                    )}
                    <Link href={{ pathname: '/exercise/[id]', params: { id: ex.id } }} asChild>
                      <Pressable accessibilityRole="link" style={styles.slot}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.slotName}>{ex.name.es}</Text>
                          {/* Debajo del nombre y no al lado: con «8 en total (4 con cada brazo)» no cabe en una fila. */}
                          <Text style={styles.slotRx}>{slotLabel(s)}</Text>
                          {b.type === 'main_strength' && <Text style={styles.muted}>{strengthInfo(ex)}</Text>}
                          {(s.rationale ?? supportNote(s, b.type, dayMain, dayWorked, EXERCISES_BY_ID)) && (
                            <Text style={styles.muted}>
                              {s.rationale ?? supportNote(s, b.type, dayMain, dayWorked, EXERCISES_BY_ID)}
                            </Text>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </Pressable>
                    </Link>
                  </Fragment>
                );
              })}
            </View>
          ))}
          {!editing && (
            <Button
              label="Rehacer o ajustar este día"
              variant={stale || hasPainful ? 'primary' : 'ghost'}
              onPress={openAdjust}
            />
          )}
        </>
      )}

      {editing && (
        <AdjustPanel
          cfg={editing}
          hasConditions={hasConditions}
          hasRoutine={!!dayPlan}
          level={profile?.level ?? 'intermediate'}
          estimate={estimate}
          strengthFull={strengthFull}
          onEdit={edit}
          setBlock={setBlock}
          onConfirm={() => rebuild(editing)}
          // Sin rutina aún no hay nada a qué volver: el panel queda abierto.
          onCancel={cfg.active && !dayPlan && !weekEmpty ? undefined : () => setDraft(null)}
        />
      )}
    </ScrollView>
  );
}

// Duración de la rutina en minutos; solo se habla más si hay algo que decidir.
function TimeNotice({
  dayPlan,
  cfg,
  weightKg,
  onFit,
  onFull,
  onAddGentle,
  canAddStrength,
  onDismiss,
}: {
  dayPlan: DayPlan;
  cfg: DayConfig;
  weightKg: number | null;
  onFit: () => void;
  onFull: () => void;
  onAddGentle: () => void;
  /** false: los otros días ya ocupan los 6 de Fuerza; este queda libre de ella. */
  canAddStrength: boolean;
  onDismiss: () => void;
}) {
  const { minutes, available, state } = timeStatus(dayPlan.blocks, cfg);
  const free = available - minutes;
  const over = state === 'over' || state === 'far_over';
  const dismissed = !!dayPlan.timeNoticeDismissed;
  const offerGentle = state === 'short' && !cfg.blocks.main.enabled && free >= 15 && !dismissed && canAddStrength;
  const kcal = weightKg ? kcalRangeLabel(averageMet(dayPlan.blocks, EXERCISES_BY_ID), weightKg, minutes) : null;

  return (
    <>
      <Text style={styles.muted}>
        ≈ {minutes} min de {available}
        {kcal && ` · ${kcal}`}
      </Text>
      {!weightKg && <Text style={styles.muted}>Anota tu peso en Cuerpo para estimar tus calorías.</Text>}
      {state === 'short' && (
        <Text style={styles.muted}>
          {leadPart(cfg) === 'prehab'
            ? `Tu sesión dura ${minutes} min. Para esta zona es suficiente.`
            : `Tu sesión quedó en ${minutes} min; con eso es suficiente. Te quedan ${free} libres.`}
        </Text>
      )}
      {offerGentle && (
        <>
          <Text style={styles.muted}>Te sobran {free} min. ¿Sumamos fuerza suave?</Text>
          <Button label="Sumar fuerza suave" variant="ghost" onPress={onAddGentle} />
          <Button label="No, gracias" variant="ghost" onPress={onDismiss} />
        </>
      )}
      {over && !dismissed && !cfg.fitToTime && (
        <>
          <Text style={styles.stale}>
            Para que tu entrenamiento sea efectivo, tu sesión completa dura ≈ {minutes} min: {minutes - available} más
            de los {available} que tienes. Te recomendamos hacerla completa; si hoy no te alcanza, la ajustamos.
          </Text>
          <Button label="Hacerla completa" onPress={onDismiss} />
          <Button label={`Ajustar a ${available} min`} variant="ghost" onPress={onFit} />
        </>
      )}
      {cfg.fitToTime && cfg.blocks.main.enabled && (
        <>
          <Text style={styles.muted}>
            Ajustamos la fuerza a tus {available} min, con menos series o ejercicios que la sesión completa.
          </Text>
          <Button label="Volver a la sesión completa" variant="ghost" onPress={onFull} />
        </>
      )}
    </>
  );
}

function AdjustPanel({
  cfg,
  hasConditions,
  hasRoutine,
  level,
  estimate,
  strengthFull,
  onEdit,
  setBlock,
  onConfirm,
  onCancel,
}: {
  cfg: DayConfig;
  strengthFull: boolean;
  hasConditions: boolean;
  hasRoutine: boolean;
  level: LocalProfile['level'];
  estimate: number | null;
  onEdit: (patch: (d: DayConfig) => DayConfig) => void;
  setBlock: <K extends keyof Blocks>(key: K, patch: Partial<Blocks[K]>) => void;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  const parts = dayChoiceOf(cfg);
  const groups = cfg.blocks.main.muscleGroups;
  // Abierto solo si la persona ya fijó alguna cantidad a mano.
  const [showCounts, setShowCounts] = useState(() => DAY_PARTS.some((p) => cfg.blocks[p].fixedCount));
  const [restNote, setRestNote] = useState(false);
  const set = (patch: Partial<DayConfig>) => onEdit((d) => ({ ...d, ...patch }));
  const confirmLabel = !cfg.active
    ? 'Guardar como descanso'
    : hasRoutine
      ? 'Rehacer con estos ajustes'
      : 'Armar este día';
  const estimateLabel = estimate != null ? `Con esto: ≈ ${estimate} min de ${cfg.availableMinutes}` : null;

  return (
    <>
      <View style={styles.divider} />
      <Text style={styles.settingsTitle}>Ajustar este día</Text>

      <Text style={styles.section}>¿Qué haces este día?</Text>
      <View style={styles.chips}>
        {DAY_TYPE_PARTS.map((p) => (
          <Chip
            key={p}
            label={dayPartLabel(p, hasConditions)}
            active={parts.includes(p)}
            onPress={() => {
              // Agregar Fuerza cuando ya hay 6 días: no se aplica y se explica por qué.
              if (p === 'main' && !parts.includes('main') && strengthFull) return setRestNote(true);
              setRestNote(false);
              // Fuerza y Lesión van en días distintos: al elegir una, sale la otra. Los minutos se
              // acomodan al tipo de día (Fuerza 30 a 90; apoyo 10 a 40).
              onEdit((d) => {
                const next = applyDayChoice(d, toggleDayType(dayChoiceOf(d), p));
                const range = minutesRange(dayChoiceOf(next));
                const availableMinutes = Math.min(range.max, Math.max(range.min, next.availableMinutes));
                return next.active ? { ...next, availableMinutes } : next;
              });
            }}
          />
        ))}
        <Chip label="Descanso" active={!parts.length} onPress={() => onEdit((d) => applyDayChoice(d, []))} />
      </View>
      {restNote && <Text style={styles.restNote}>{strengthLimitNote(level)}</Text>}
      <Text style={styles.muted}>{parts.length ? dayChoiceLabel(parts, hasConditions) : 'Sin entrenamiento'}</Text>
      {parts.length > 0 && <Text style={styles.muted}>{dayIncludedNote(parts)}</Text>}

      {cfg.active && (
        <>
          <Text style={styles.section}>¿Dónde entrenas?</Text>
          <View style={styles.segment}>
            <Segment label="Casa" on={cfg.location === 'home'} onPress={() => set({ location: 'home' })} />
            <Segment label="Parque" on={cfg.location === 'park'} onPress={() => set({ location: 'park' })} />
          </View>

          <Text style={styles.section}>¿Cuánto tiempo tienes?</Text>
          <Row label="Tiempo disponible">
            <Stepper
              value={cfg.availableMinutes}
              min={Math.min(cfg.availableMinutes, minutesRange(parts).min)}
              max={Math.max(cfg.availableMinutes, minutesRange(parts).max)}
              step={5}
              suffix="'"
              onChange={(availableMinutes) => set({ availableMinutes })}
            />
          </Row>
          {cfg.blocks.main.enabled && (
            <Text style={styles.muted}>
              Fuerza necesita al menos 20 min. Con menos tiempo, elige {dayPartLabel('prehab', hasConditions)} o
              Elongación.
            </Text>
          )}
          <Text style={styles.muted}>{estimateLabel}</Text>

          {/* La cantidad de ejercicios la decide la app con los minutos; fijarla a mano es opcional. */}
          <Pressable accessibilityRole="button" onPress={() => setShowCounts(!showCounts)} hitSlop={8}>
            <Text style={styles.link}>
              {showCounts ? 'Ocultar la cantidad de ejercicios' : 'Elegir la cantidad de ejercicios (avanzado)'}
            </Text>
          </Pressable>
          {!showCounts && (
            <Text style={styles.muted}>
              La app calcula cuántos ejercicios lleva cada parte con tus minutos y tu nivel.
            </Text>
          )}

          {showCounts && cfg.blocks.warmup.enabled && (
            <BlockCard title="Calentamiento">
              <CountRow
                count={cfg.blocks.warmup.exerciseCount}
                auto={partCount('warmup', cfg, level)}
                max={8}
                fixed={!!cfg.blocks.warmup.fixedCount}
                onChange={(patch) => setBlock('warmup', patch)}
              />
            </BlockCard>
          )}

          {showCounts && cfg.blocks.prehab.enabled && (
            <BlockCard
              title={dayPartLabel('prehab', hasConditions)}
              description={
                hasConditions
                  ? 'Prioriza ejercicios para cuidar tus condiciones.'
                  : 'Ejercicios de movilidad y estabilidad.'
              }
            >
              <CountRow
                auto={partCount('prehab', cfg, level)}
                count={cfg.blocks.prehab.exerciseCount}
                max={6}
                fixed={!!cfg.blocks.prehab.fixedCount}
                onChange={(patch) => setBlock('prehab', patch)}
              />
            </BlockCard>
          )}

          {cfg.blocks.main.enabled && (
            <BlockCard title="Fuerza">
              {showCounts && (
                <CountRow
                  count={cfg.blocks.main.exerciseCount}
                  auto={partCount('main', cfg, level)}
                  max={10}
                  fixed={!!cfg.blocks.main.fixedCount}
                  onChange={(patch) => setBlock('main', patch)}
                />
              )}
              {hasConditions && cfg.blocks.prehab.enabled && (
                <Row label="Suave (día de lesión)">
                  <Switch
                    value={cfg.gentleStrength}
                    onValueChange={(gentleStrength) => set({ gentleStrength })}
                    trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
                    thumbColor="#fff"
                    ios_backgroundColor={colors.surfaceAlt}
                    {...({ activeThumbColor: colors.white } as object)}
                  />
                </Row>
              )}
              {cfg.gentleStrength && (
                <Text style={styles.muted}>Máximo 2 ejercicios sencillos, sin balísticos ni saltos.</Text>
              )}
              <Text style={styles.rowLabel}>Zonas con preferencia</Text>
              <Text style={styles.muted}>
                Esto solo inclina la elección de ejercicios; la estructura del día la arma la app.
              </Text>
              <View style={styles.chips}>
                {MUSCLE_GROUPS.map((g) => (
                  <Chip
                    key={g}
                    label={MUSCLE_GROUP_LABELS[g]}
                    active={groups.includes(g)}
                    onPress={() => {
                      const next = groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g];
                      if (next.length) setBlock('main', { muscleGroups: next });
                    }}
                  />
                ))}
              </View>
            </BlockCard>
          )}

          {showCounts && cfg.blocks.cooldown.enabled && (
            <BlockCard title="Elongación" description="Estiramientos de los músculos trabajados en la sesión.">
              <CountRow
                auto={partCount('cooldown', cfg, level)}
                count={cfg.blocks.cooldown.exerciseCount}
                max={8}
                fixed={!!cfg.blocks.cooldown.fixedCount}
                onChange={(patch) => setBlock('cooldown', patch)}
              />
            </BlockCard>
          )}
        </>
      )}

      {estimateLabel && <Text style={styles.estimate}>{estimateLabel}</Text>}
      <Button label={confirmLabel} onPress={onConfirm} />
      {onCancel && <Button label="Cancelar" variant="ghost" onPress={onCancel} />}
      {cfg.active && <Text style={styles.muted}>Arma solo este día al instante, sin tocar el resto de la semana.</Text>}
    </>
  );
}

// Auto: la app ajusta la cantidad a los minutos. Al mover el número, queda fija.
function CountRow({
  count,
  auto,
  max,
  fixed,
  onChange,
}: {
  count: number;
  auto: number;
  max: number;
  fixed: boolean;
  onChange: (patch: { exerciseCount?: number; fixedCount?: boolean }) => void;
}) {
  return (
    <>
      <Row label="Ejercicios">
        <View style={styles.countControls}>
          <Chip label="Auto" active={!fixed} onPress={() => onChange({ fixedCount: undefined })} />
          <Stepper
            value={fixed ? count : auto}
            min={1}
            max={max}
            onChange={(exerciseCount) => onChange({ exerciseCount, fixedCount: true })}
          />
        </View>
      </Row>
      <Text style={styles.muted}>
        {fixed
          ? `Respetamos estos ${count}; ajustamos vueltas y duración.`
          : `Con tus minutos, la app propone ${auto}.`}
      </Text>
    </>
  );
}

function Segment({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" aria-selected={!!(on)} onPress={onPress} style={[styles.segBtn, on && styles.segOn]}>
      <Text style={[styles.segText, on && { color: colors.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

function BlockCard({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <View style={styles.block}>
      <View style={{ gap: 2 }}>
        <Text style={styles.blockTitle}>{title}</Text>
        {description && <Text style={styles.muted}>{description}</Text>}
      </View>
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  date: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: spacing.lg },
  settingsTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  section: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: spacing.md },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center' },
  segOn: { backgroundColor: colors.accent },
  segText: { color: colors.textMuted, fontWeight: '700' },
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  blockTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  countControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  estimate: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  link: { color: colors.link, fontSize: 14, fontWeight: '700', marginTop: spacing.sm },
  restNote: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  stale: { color: colors.warning, fontSize: 13 },
  routineBlock: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 2 },
  routineTitle: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  roleTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: spacing.sm },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  slotName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  slotRx: { color: colors.accent, fontSize: 14, fontWeight: '800' },
});
