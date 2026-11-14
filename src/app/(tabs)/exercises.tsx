import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BodyMap, bestSide } from '@/components/BodyMap';
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises.seed';
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS, type MuscleGroupId } from '@/domain/catalog';
import { BLOCK_LABELS } from '@/domain/labels';
import { QUICK_ROUTINES, type QuickRoutine, routineMinutes, routineSteps } from '@/domain/quickRoutines';
import type { BlockType, Exercise } from '@/domain/schema';
import { DAYS } from '@/domain/week';
import { ROUTINE_ICONS, ROUTINE_TONES } from '@/features/routines/tones';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { colors, display, radius, spacing } from '@/theme';

// La pantalla responde primero «¿qué necesitas hoy?» (rutinas rápidas para estirar o soltar una
// zona), después muestra lo que toca esta semana y, al final, el catálogo completo para explorar.

type Filter =
  { kind: 'all' } | { kind: 'kettlebell' } | { kind: 'group'; id: MuscleGroupId } | { kind: 'block'; id: BlockType };

const GROUP_COLORS: Record<MuscleGroupId, string> = {
  legs: colors.accent,
  back: colors.low,
  shoulders: colors.warning,
  chest: '#AFA9EC',
  arms: colors.good,
  core: colors.link,
};

const FILTERS: { label: string; filter: Filter; color: string }[] = [
  { label: 'Todos', filter: { kind: 'all' }, color: colors.textMuted },
  // Todo lo que se hace con kettlebell, de cualquier bloque.
  { label: 'Kettlebell', filter: { kind: 'kettlebell' }, color: colors.accent },
  ...MUSCLE_GROUPS.map((id) => ({
    label: MUSCLE_GROUP_LABELS[id],
    filter: { kind: 'group', id } as Filter,
    color: GROUP_COLORS[id],
  })),
  ...(['warmup', 'prehab', 'cooldown'] as const).map((id) => ({
    label: BLOCK_LABELS[id],
    filter: { kind: 'block', id } as Filter,
    color: colors.textMuted,
  })),
];

const sameFilter = (a: Filter, b: Filter) =>
  a.kind === b.kind && (a.kind === 'all' || a.kind === 'kettlebell' || a.id === (b as typeof a).id);

const matches = (e: Exercise, filter: Filter) =>
  filter.kind === 'all'
    ? true
    : filter.kind === 'kettlebell'
      ? e.equipment.required.includes('kettlebell')
      : filter.kind === 'group'
        ? e.muscleGroups.includes(filter.id) && e.blockTypes.includes('main_strength')
        : e.blockTypes.includes(filter.id);

// Para buscar sin importar tildes ni mayúsculas.
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export default function ExerciseLibrary() {
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const { sessions } = useHistory();
  const { plan } = usePlan();

  // Cuántas sesiones incluyeron cada ejercicio: «Lo hiciste N veces».
  const timesDone = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of sessions)
      for (const id of new Set(s.sets.map((l) => l.exerciseId))) count.set(id, (count.get(id) ?? 0) + 1);
    return count;
  }, [sessions]);

  // Los ejercicios de Fuerza del plan de esta semana, con los días en que tocan.
  const thisWeek = useMemo(() => {
    const days = new Map<string, string[]>();
    for (const d of plan?.days ?? [])
      for (const b of d.blocks)
        if (b.type === 'main_strength')
          for (const slot of b.slots) {
            const label = DAYS.find((x) => x.id === d.day)?.short ?? '';
            const list = days.get(slot.exerciseId) ?? [];
            if (!list.includes(label)) days.set(slot.exerciseId, [...list, label]);
          }
    return [...days].flatMap(([id, list]) => {
      const exercise = EXERCISES_BY_ID.get(id);
      return exercise ? [{ exercise, days: list.join(' · ') }] : [];
    });
  }, [plan]);

  const counts = useMemo(() => FILTERS.map(({ filter: f }) => EXERCISES.filter((e) => matches(e, f)).length), []);

  const data = useMemo(() => {
    const q = plain(query.trim());
    return EXERCISES.filter((e) => matches(e, filter) && (!q || plain(e.name.es).includes(q)));
  }, [filter, query]);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={data}
      keyExtractor={(e) => e.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.sectionTitle}>¿Qué necesitas hoy?</Text>
          <View style={styles.routines}>
            {QUICK_ROUTINES.map((r, i) => (
              <RoutineCard key={r.id} routine={r} wide={i === 0} />
            ))}
          </View>

          {thisWeek.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>En tu semana</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {thisWeek.map(({ exercise, days }) => (
                  <Link key={exercise.id} href={{ pathname: '/exercise/[id]', params: { id: exercise.id } }} asChild>
                    <Pressable accessibilityRole="link" style={styles.weekCard}>
                      <Text style={styles.weekDays}>{days}</Text>
                      <Text style={styles.weekName} numberOfLines={2}>
                        {exercise.name.es}
                      </Text>
                    </Pressable>
                  </Link>
                ))}
              </ScrollView>
            </>
          )}

          <Text style={styles.sectionTitle}>Todos los ejercicios</Text>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar un ejercicio"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Buscar un ejercicio"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Borrar la búsqueda" onPress={() => setQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {FILTERS.map(({ label, filter: f, color }, i) => {
              const active = sameFilter(f, filter);
              return (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  aria-selected={active}
                  onPress={() => setFilter(f)}
                  style={[styles.tile, { borderTopColor: color }, active && styles.tileActive]}>
                  <Text style={styles.tileLabel}>{label}</Text>
                  <Text style={styles.tileCount}>{counts[i]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No hay ejercicios con ese nombre en esta sección.</Text>}
      renderItem={({ item }) => <ExerciseCard exercise={item} times={timesDone.get(item.id) ?? 0} />}
    />
  );
}

function RoutineCard({ routine: r, wide }: { routine: QuickRoutine; wide: boolean }) {
  const tone = ROUTINE_TONES[r.tone];
  const steps = routineSteps(r, EXERCISES_BY_ID);
  return (
    <Link href={{ pathname: '/routine/[id]', params: { id: r.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        testID={`routine-${r.id}`}
        // Un solo estilo: el enlace de Expo Router no acepta una lista de estilos en su hijo.
        style={StyleSheet.flatten([styles.routine, wide && styles.routineWide, { backgroundColor: tone.bg }])}>
        <View style={styles.routineTop}>
          <Ionicons name={ROUTINE_ICONS[r.id] ?? 'body-outline'} size={wide ? 28 : 24} color={tone.vivid} />
          <Text style={[styles.routineMeta, { color: tone.sub }]}>
            {steps.length} ejercicios · {routineMinutes(steps)} min
          </Text>
        </View>
        <View>
          <Text style={[styles.routineTitle, wide && styles.routineTitleWide, { color: tone.text }]}>{r.title}</Text>
          <Text style={[styles.routineZone, wide && styles.routineZoneWide, { color: tone.sub }]}>{wide ? r.when : r.zone}</Text>
        </View>
      </Pressable>
    </Link>
  );
}

function ExerciseCard({ exercise: e, times }: { exercise: Exercise; times: number }) {
  const withKettlebell = e.equipment.required.includes('kettlebell');
  return (
    <Link href={{ pathname: '/exercise/[id]', params: { id: e.id } }} asChild>
      <Pressable accessibilityRole="link">
        <View style={styles.card}>
          <View style={styles.cardMap}>
            {/* Una sola figura, del lado donde más se ve lo que trabaja: así se alcanza a leer. */}
            <BodyMap
              primary={e.anatomy.primary}
              secondary={e.anatomy.secondary}
              views={[bestSide(e.anatomy.primary, e.anatomy.secondary)]}
              height={104}
            />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {e.name.es}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {e.blockTypes.map((b) => BLOCK_LABELS[b]).join(' · ')}
            </Text>
            <View style={styles.level} accessibilityLabel={`Dificultad ${e.complexityLevel} de 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <View key={n} style={[styles.levelDot, n <= e.complexityLevel && styles.levelDotOn]} />
              ))}
              <Text style={styles.levelText}>Dificultad {e.complexityLevel} de 5</Text>
            </View>
            <View style={styles.tags}>
              {withKettlebell && <Text style={styles.kbBadge}>KETTLEBELL</Text>}
              {times > 0 && (
                <Text style={styles.done}>
                  <Ionicons name="checkmark" size={13} color={colors.good} /> Lo hiciste {times}{' '}
                  {times === 1 ? 'vez' : 'veces'}
                </Text>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  header: { gap: spacing.md },
  sectionTitle: { color: colors.textMuted, ...display(20), marginTop: spacing.sm },
  row: { gap: spacing.sm },

  routines: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  routine: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 132,
    borderRadius: radius.lg,
    padding: spacing.lg,
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  routineWide: { flexBasis: '100%', minHeight: 124 },
  routineTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  routineMeta: { fontSize: 12, fontWeight: '700' },
  routineTitle: { ...display(24) },
  routineTitleWide: { ...display(32) },
  routineZoneWide: { minHeight: 0 },
  // Alto de dos líneas: así los títulos de una misma fila quedan a la misma altura.
  routineZone: { fontSize: 13, lineHeight: 18, minHeight: 36, marginTop: 2 },

  weekCard: {
    width: 148,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    padding: spacing.md,
    gap: spacing.xs,
  },
  weekDays: { color: colors.link, fontSize: 12, fontWeight: '800' },
  weekName: { color: colors.text, fontSize: 14, fontWeight: '700' },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  // 16 puntos: con menos, Safari en iPhone acerca la pantalla al tocar el campo.
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: spacing.md },

  tile: {
    minWidth: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderTopWidth: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  tileActive: { backgroundColor: colors.surfaceAlt },
  tileLabel: { color: colors.text, ...display(18) },
  tileCount: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },

  empty: { color: colors.textMuted, fontSize: 15, textAlign: 'center', paddingVertical: spacing.xl },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
  },
  cardMap: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm },
  cardBody: { flex: 1, gap: spacing.xs },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 13 },
  level: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  levelDot: { width: 14, height: 5, borderRadius: 3, backgroundColor: colors.border },
  levelDotOn: { backgroundColor: colors.accent },
  levelText: { color: colors.textMuted, fontSize: 12, marginLeft: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  kbBadge: {
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  done: { color: colors.good, fontSize: 12, fontWeight: '700' },
});
