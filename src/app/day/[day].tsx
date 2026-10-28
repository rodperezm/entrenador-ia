import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Button, Stepper } from '@/components/ui';
import { EXERCISES_BY_ID } from '@/data/exercises.seed';
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from '@/domain/catalog';
import { BLOCK_LABELS } from '@/domain/labels';
import { type DayConfig, DayOfWeek } from '@/domain/schema';
import {
  applyDayChoice,
  configHash,
  DAY_LONG,
  DAY_PARTS,
  dayDate,
  fmtDayDate,
  isToday,
  dayChoiceLabel,
  dayChoiceOf,
  dayPartLabel,
  toggleDayPart,
} from '@/domain/week';
import { slotLabel } from '@/features/planner/describe';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

type Blocks = DayConfig['blocks'];

export default function DayScreen() {
  const params = useLocalSearchParams<{ day: string }>();
  const parsed = DayOfWeek.safeParse(params.day);
  const { week, plan, updateDay } = usePlan();
  const { profile } = useProfile();
  if (!parsed.success) return null;
  const day = parsed.data;
  const cfg = week.days.find((d) => d.day === day)!;

  const set = (patch: Partial<DayConfig>) => updateDay(day, (d) => ({ ...d, ...patch }));
  const hasConditions = (profile?.conditions.length ?? 0) > 0;
  const parts = dayChoiceOf(cfg);
  const today = isToday(day);
  const setBlock = <K extends keyof Blocks>(key: K, patch: Partial<Blocks[K]>) =>
    updateDay(day, (d) => ({ ...d, blocks: { ...d.blocks, [key]: { ...d.blocks[key], ...patch } } }));

  const dayPlan = plan?.days.find((p) => p.day === day);
  const stale = !!plan && !!profile && plan.configHash !== configHash(week, profile.updatedAt);
  const groups = cfg.blocks.main.muscleGroups;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: DAY_LONG[day] }} />
      <Text style={[styles.date, today && { color: colors.accent }]}>
        {today ? 'Hoy · ' : ''}
        {DAY_LONG[day]} {fmtDayDate(dayDate(day))}
      </Text>

      {/* Primero la rutina; la configuración del día va después. */}
      {cfg.active && (
        <>
          <Text style={[styles.section, { marginTop: 0 }]}>Rutina de este día</Text>
          {!dayPlan ? (
            <Text style={styles.muted}>Aún no hay rutina. Vuelve a «Mi semana» y toca «Generar mi semana».</Text>
          ) : (
            <>
              {stale && (
                <Text style={styles.stale}>Esta rutina es anterior a tus últimos cambios. Vuelve a generarla.</Text>
              )}
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
                      <Link key={i} href={{ pathname: '/exercise/[id]', params: { id: ex.id } }} asChild>
                        <Pressable style={styles.slot}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.slotName}>{ex.name.es}</Text>
                            {s.rationale && <Text style={styles.muted}>{s.rationale}</Text>}
                          </View>
                          <Text style={styles.slotRx}>{slotLabel(s)}</Text>
                        </Pressable>
                      </Link>
                    );
                  })}
                </View>
              ))}
            </>
          )}
          <View style={styles.divider} />
          <Text style={styles.settingsTitle}>Ajustar este día</Text>
        </>
      )}

      <Text style={styles.section}>¿Qué haces este día?</Text>
      <View style={styles.chips}>
        {DAY_PARTS.map((p) => (
          <Chip
            key={p}
            label={dayPartLabel(p, hasConditions)}
            active={parts.includes(p)}
            onPress={() => updateDay(day, (d) => applyDayChoice(d, toggleDayPart(dayChoiceOf(d), p)))}
          />
        ))}
        <Chip label="Descanso" active={!parts.length} onPress={() => updateDay(day, (d) => applyDayChoice(d, []))} />
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
          <Text style={styles.muted}>Si la rutina no cabe en este tiempo, usamos menos ejercicios.</Text>

          <Text style={styles.section}>Bloques</Text>

          <BlockCard
            title="Calentamiento / activación"
            enabled={cfg.blocks.warmup.enabled}
            onToggle={(enabled) => setBlock('warmup', { enabled })}
          >
            <Row label="Ejercicios">
              <Stepper
                value={cfg.blocks.warmup.exerciseCount}
                min={1}
                max={8}
                onChange={(exerciseCount) => setBlock('warmup', { exerciseCount })}
              />
            </Row>
          </BlockCard>

          <BlockCard
            title="Prehab / condición médica"
            description={
              profile?.conditions.length
                ? 'Prioriza ejercicios preventivos para tus condiciones.'
                : 'Ejercicios preventivos de movilidad y estabilidad.'
            }
            enabled={cfg.blocks.prehab.enabled}
            onToggle={(enabled) => setBlock('prehab', { enabled })}
          >
            <Row label="Ejercicios">
              <Stepper
                value={cfg.blocks.prehab.exerciseCount}
                min={1}
                max={6}
                onChange={(exerciseCount) => setBlock('prehab', { exerciseCount })}
              />
            </Row>
          </BlockCard>

          <BlockCard
            title="Entrenamiento principal / fuerza"
            enabled={cfg.blocks.main.enabled}
            onToggle={(enabled) => setBlock('main', { enabled })}
          >
            <Row label="Ejercicios">
              <Stepper
                value={cfg.blocks.main.exerciseCount}
                min={1}
                max={10}
                onChange={(exerciseCount) => setBlock('main', { exerciseCount })}
              />
            </Row>
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
            <Row label="Ejercicios">
              <Stepper
                value={cfg.blocks.cooldown.exerciseCount}
                min={1}
                max={8}
                onChange={(exerciseCount) => setBlock('cooldown', { exerciseCount })}
              />
            </Row>
          </BlockCard>
        </>
      )}
    </ScrollView>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
