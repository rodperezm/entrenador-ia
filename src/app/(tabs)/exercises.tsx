import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BodyMap } from '@/components/BodyMap';
import { Chip } from '@/components/Chip';
import { EXERCISES } from '@/data/exercises.seed';
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS, type MuscleGroupId } from '@/domain/catalog';
import { BLOCK_LABELS } from '@/domain/labels';
import type { BlockType, Exercise } from '@/domain/schema';
import { colors, radius, spacing } from '@/theme';

type Filter = { kind: 'all' } | { kind: 'group'; id: MuscleGroupId } | { kind: 'block'; id: BlockType };

const FILTERS: { label: string; filter: Filter }[] = [
  { label: 'Todos', filter: { kind: 'all' } },
  ...MUSCLE_GROUPS.map((id) => ({
    label: MUSCLE_GROUP_LABELS[id],
    filter: { kind: 'group', id } as Filter,
  })),
  ...(['warmup', 'prehab', 'cooldown'] as const).map((id) => ({
    label: BLOCK_LABELS[id],
    filter: { kind: 'block', id } as Filter,
  })),
];

const sameFilter = (a: Filter, b: Filter) => a.kind === b.kind && (a.kind === 'all' || a.id === (b as typeof a).id);

export default function ExerciseLibrary() {
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });

  const data = useMemo(
    () =>
      EXERCISES.filter((e) =>
        filter.kind === 'all'
          ? true
          : filter.kind === 'group'
            ? e.muscleGroups.includes(filter.id) && e.blockTypes.includes('main_strength')
            : e.blockTypes.includes(filter.id),
      ),
    [filter],
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={data}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map(({ label, filter: f }) => (
            <Chip key={label} label={label} active={sameFilter(f, filter)} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
      }
      renderItem={({ item }) => <ExerciseCard exercise={item} />}
    />
  );
}

function ExerciseCard({ exercise: e }: { exercise: Exercise }) {
  return (
    <Link href={{ pathname: '/exercise/[id]', params: { id: e.id } }} asChild>
      <Pressable>
        <View style={styles.card}>
          <View style={styles.cardMap}>
            <BodyMap primary={e.anatomy.primary} secondary={e.anatomy.secondary} height={84} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {e.name.es}
            </Text>
            <Text style={styles.cardMeta}>
              {e.blockTypes.map((b) => BLOCK_LABELS[b]).join(' · ')} · Nivel {e.complexityLevel}
            </Text>
            {e.equipment.required.includes('kettlebell') && <Text style={styles.kbBadge}>KETTLEBELL</Text>}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  chips: { gap: spacing.sm, paddingBottom: spacing.md },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
  },
  cardMap: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  cardBody: { flex: 1, gap: spacing.xs },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 13 },
  kbBadge: {
    alignSelf: 'flex-start',
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginTop: 2,
  },
});
