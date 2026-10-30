import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { Fragment, type ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Button, Stepper } from '@/components/ui';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { averageMet, kcalRangeLabel, latestWeight } from '@/domain/calories';
import { generateDayByRules } from '@/domain/generator';
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from '@/domain/catalog';
import { BLOCK_LABELS, ROLE_LABELS } from '@/domain/labels';
import { type DayConfig, DayOfWeek, type DayPlan } from '@/domain/schema';
import { dayMinutes, leadPart, timeStatus } from '@/domain/timeBudget';
import {
  applyDayChoice,
  configHash,
  dayConfigHash,
  dayHashes,
  DAYS,
  staleDays,
  DAY_LONG,
  DAY_PARTS,
  dayDate,
  fmtDayDate,
  isToday,
  dayChoiceLabel,
  dayChoiceOf,
  dayPartLabel,
  toggleDayPart,
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
  const today = isToday(day);
  const dayPlan = plan?.days.find((p) => p.day === day);
  const stale = !!plan && !!profile && staleDays(plan, week, profile.updatedAt).has(day);
  // Semana vacía (perfil nuevo o recién borrado): conviene partir por la semana completa con IA.
  const weekEmpty = !plan?.days.some((p) => week.days.some((w) => w.day === p.day && w.active));
  const offerWeek = cfg.active && !dayPlan && weekEmpty && !draft;
  // Con la semana ya armada, un día de entrenamiento sin rutina abre los ajustes directamente.
  const editing = draft ?? (cfg.active && !dayPlan && !weekEmpty ? cfg : null);

  const openAdjust = () => setDraft(cfg.active ? cfg : applyDayChoice(cfg, [...STRENGTH_DAY]));
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
    const newDay = generateDayByRules(next, others, profile, EXERCISES, sessions);
    const order = DAYS.map((d) => d.id);
    const days = [...(plan?.days ?? []).filter((p) => p.day !== day), newDay].sort(
      (a, b) => order.indexOf(a.day) - order.indexOf(b.day),
    );
    // Un plan antiguo sin huellas por día, si estaba al día, las hereda de la semana actual.
    const previousHashes =
      plan?.dayHashes ??
      (plan?.configHash === configHash(week, profile.updatedAt) ? dayHashes(week, profile.updatedAt) : {});
    await savePlan({
      days,
      summary: plan?.summary ?? 'Rutina armada día a día con las reglas de la app.',
      generatedAt: plan?.generatedAt ?? new Date().toISOString(),
      generator: plan?.generator ?? 'rules',
      configHash: plan?.configHash ?? configHash(nextWeek, profile.updatedAt),
      dayHashes: { ...previousHashes, [day]: dayConfigHash(next, profile.updatedAt) },
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
            Tu semana aún no tiene rutina. Lo mejor es armarla completa con IA: reparte los grupos musculares y varía
            los ejercicios entre días.
          </Text>
          <Button
            label={generating ? 'Armando tu semana… (hasta 1 minuto)' : 'Generar mi semana con IA'}
            onPress={generate}
            disabled={generating}
          />
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
          {stale && !editing && (
            <Text style={styles.stale}>
              Tu perfil cambió desde que se armó esta rutina. Toca «Rehacer o ajustar este día» para actualizarla.
            </Text>
          )}
          <TimeNotice
            dayPlan={dayPlan}
            cfg={cfg}
            weightKg={latestWeight(records)}
            onFit={() => rebuild(withAutoCounts(cfg))}
            onAddGentle={() => rebuild(withGentleStrength(cfg))}
            onDismiss={dismissTimeNotice}
          />
          <Button
            label="Empezar entrenamiento"
            onPress={() => router.push({ pathname: '/workout/[day]', params: { day } })}
          />
          {dayPlan.blocks.map((b) => (
            <View key={b.type} style={styles.routineBlock}>
              <Text style={styles.routineTitle}>{BLOCK_LABELS[b.type]}</Text>
              {b.slots.map((s, i) => {
                const ex = EXERCISES_BY_ID.get(s.exerciseId);
                if (!ex) return null;
                return (
                  <Fragment key={i}>
                    {s.role && s.role !== b.slots[i - 1]?.role && (
                      <Text style={styles.roleTitle}>{ROLE_LABELS[s.role]}</Text>
                    )}
                    <Link href={{ pathname: '/exercise/[id]', params: { id: ex.id } }} asChild>
                      <Pressable style={styles.slot}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.slotName}>{ex.name.es}</Text>
                          {s.rationale && <Text style={styles.muted}>{s.rationale}</Text>}
                        </View>
                        <Text style={styles.slotRx}>{slotLabel(s)}</Text>
                      </Pressable>
                    </Link>
                  </Fragment>
                );
              })}
            </View>
          ))}
          {!editing && (
            <Button label="Rehacer o ajustar este día" variant={stale ? 'primary' : 'ghost'} onPress={openAdjust} />
          )}
        </>
      )}

      {editing && (
        <AdjustPanel
          cfg={editing}
          hasConditions={hasConditions}
          hasRoutine={!!dayPlan}
          estimate={estimate}
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
  onAddGentle,
  onDismiss,
}: {
  dayPlan: DayPlan;
  cfg: DayConfig;
  weightKg: number | null;
  onFit: () => void;
  onAddGentle: () => void;
  onDismiss: () => void;
}) {
  const { minutes, available, state } = timeStatus(dayPlan.blocks, cfg);
  const free = available - minutes;
  const over = state === 'over' || state === 'far_over';
  const dismissed = !!dayPlan.timeNoticeDismissed;
  const offerGentle = state === 'short' && !cfg.blocks.main.enabled && free >= 15 && !dismissed;
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
      {over && !dismissed && (
        <>
          <Text style={styles.stale}>
            {state === 'over'
              ? `Esta sesión dura ≈ ${minutes} min, ${minutes - available} más de los que tienes.`
              : `Con esta cantidad de ejercicios serían ≈ ${minutes} min. Te recomendamos ajustarla.`}
          </Text>
          <Button label={`Ajustar a ${available} min`} onPress={onFit} />
          <Button label="Dejarla así" variant="ghost" onPress={onDismiss} />
        </>
      )}
    </>
  );
}

function AdjustPanel({
  cfg,
  hasConditions,
  hasRoutine,
  estimate,
  onEdit,
  setBlock,
  onConfirm,
  onCancel,
}: {
  cfg: DayConfig;
  hasConditions: boolean;
  hasRoutine: boolean;
  estimate: number | null;
  onEdit: (patch: (d: DayConfig) => DayConfig) => void;
  setBlock: <K extends keyof Blocks>(key: K, patch: Partial<Blocks[K]>) => void;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  const parts = dayChoiceOf(cfg);
  const groups = cfg.blocks.main.muscleGroups;
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
        {DAY_PARTS.map((p) => (
          <Chip
            key={p}
            label={dayPartLabel(p, hasConditions)}
            active={parts.includes(p)}
            onPress={() => onEdit((d) => applyDayChoice(d, toggleDayPart(dayChoiceOf(d), p)))}
          />
        ))}
        <Chip label="Descanso" active={!parts.length} onPress={() => onEdit((d) => applyDayChoice(d, []))} />
      </View>
      <Text style={styles.muted}>{parts.length ? dayChoiceLabel(parts, hasConditions) : 'Sin entrenamiento'}</Text>

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
              min={10}
              max={120}
              step={5}
              suffix="'"
              onChange={(availableMinutes) => set({ availableMinutes })}
            />
          </Row>
          <Text style={styles.muted}>{estimateLabel}</Text>

          <Text style={styles.section}>Bloques</Text>

          <BlockCard
            title="Calentamiento / activación"
            enabled={cfg.blocks.warmup.enabled}
            onToggle={(enabled) => setBlock('warmup', { enabled })}
          >
            <CountRow
              count={cfg.blocks.warmup.exerciseCount}
              max={8}
              fixed={!!cfg.blocks.warmup.fixedCount}
              onChange={(patch) => setBlock('warmup', patch)}
            />
          </BlockCard>

          <BlockCard
            title="Prehab / condición médica"
            description={
              hasConditions
                ? 'Prioriza ejercicios preventivos para tus condiciones.'
                : 'Ejercicios preventivos de movilidad y estabilidad.'
            }
            enabled={cfg.blocks.prehab.enabled}
            onToggle={(enabled) => setBlock('prehab', { enabled })}
          >
            <CountRow
              count={cfg.blocks.prehab.exerciseCount}
              max={6}
              fixed={!!cfg.blocks.prehab.fixedCount}
              onChange={(patch) => setBlock('prehab', patch)}
            />
          </BlockCard>

          <BlockCard
            title="Entrenamiento principal / fuerza"
            enabled={cfg.blocks.main.enabled}
            onToggle={(enabled) => setBlock('main', { enabled })}
          >
            <CountRow
              count={cfg.blocks.main.exerciseCount}
              max={10}
              fixed={!!cfg.blocks.main.fixedCount}
              onChange={(patch) => setBlock('main', patch)}
            />
            {hasConditions && cfg.blocks.prehab.enabled && (
              <Row label="Suave (día de lesión)">
                <Switch
                  value={cfg.gentleStrength}
                  onValueChange={(gentleStrength) => set({ gentleStrength })}
                  trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
                  thumbColor="#fff"
                  ios_backgroundColor={colors.surfaceAlt}
                  {...({ activeThumbColor: '#fff' } as object)}
                />
              </Row>
            )}
            {cfg.gentleStrength && (
              <Text style={styles.muted}>Máximo 2 ejercicios sencillos, sin balísticos ni saltos.</Text>
            )}
            <Text style={styles.rowLabel}>Grupos musculares</Text>
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

          <BlockCard
            title="Enfriamiento y elongación"
            description="Estiramientos de los músculos trabajados en la sesión."
            enabled={cfg.blocks.cooldown.enabled}
            onToggle={(enabled) => setBlock('cooldown', { enabled })}
          >
            <CountRow
              count={cfg.blocks.cooldown.exerciseCount}
              max={8}
              fixed={!!cfg.blocks.cooldown.fixedCount}
              onChange={(patch) => setBlock('cooldown', patch)}
            />
          </BlockCard>
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
  max,
  fixed,
  onChange,
}: {
  count: number;
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
            value={count}
            min={1}
            max={max}
            onChange={(exerciseCount) => onChange({ exerciseCount, fixedCount: true })}
          />
        </View>
      </Row>
      <Text style={styles.muted}>
        {fixed
          ? `Respetamos estos ${count}; ajustamos vueltas y duración.`
          : 'La cantidad se ajusta a tus minutos.'}
      </Text>
    </>
  );
}

function Segment({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segBtn, on && styles.segOn]}>
      <Text style={[styles.segText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

function BlockCard({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description?: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.block, enabled && styles.blockOn]}>
      <View style={styles.blockHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.blockTitle}>{title}</Text>
          {description && <Text style={styles.muted}>{description}</Text>}
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
          thumbColor="#fff"
          ios_backgroundColor={colors.surfaceAlt}
          // En web, react-native-web usa su propio color para la bolita activa.
          {...({ activeThumbColor: '#fff' } as object)}
        />
      </View>
      {enabled && children}
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
    opacity: 0.7,
  },
  blockOn: { opacity: 1 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  blockTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  countControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  estimate: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
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
  slotRx: { color: colors.text, fontSize: 14, fontWeight: '800' },
});
