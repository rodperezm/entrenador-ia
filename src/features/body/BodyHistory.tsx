import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { confirmAction } from '@/components/ConfirmDialog';
import { calcIndices, fmtNum, type FoldRecord, type TapeRecord } from '@/domain/body';
import { type Change, type HistoryDay, historyDays, weekday } from '@/domain/bodyHistory';
import { colors, display, radius, spacing } from '@/theme';

// Historial: un día por fila con lo medido y el peso. Al tocarlo se abre todo lo de ese día,
// con lo que cambió respecto de la medición anterior. Borrar queda adentro, con confirmación.

type Props = {
  records: TapeRecord[];
  folds: FoldRecord[];
  birthDate: string | null;
  heightCm: number | null;
  onDelete: (kind: 'record' | 'fold', id: string) => void;
};

const ddmm = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
const TAPE_ROWS = [
  ['Tórax', 'chestCm'],
  ['Abdomen', 'abdomenCm'],
  ['Cintura', 'waistCm'],
  ['Cadera', 'hipCm'],
] as const;

export function BodyHistory({ records, folds, birthDate, heightCm, onDelete }: Props) {
  const days = historyDays(records, folds, birthDate);
  const [open, setOpen] = useState<string | null>(null);
  if (!days.length) return null;
  return (
    <View style={styles.wrap} testID="body-history">
      <Text style={styles.section}>Historial</Text>
      <Text style={styles.sub}>Un día por fila. Tócalo para ver todo lo que mediste.</Text>
      {days.map((d) => (
        <Day
          key={d.date}
          day={d}
          heightCm={heightCm}
          open={open === d.date}
          onToggle={() => setOpen(open === d.date ? null : d.date)}
          onDelete={() =>
            confirmAction({
              title: `¿Borrar el ${ddmm(d.date)}?`,
              message: 'Se borran el peso, la cinta y los pliegues de ese día. No se puede deshacer.',
              label: 'Borrar este día',
              danger: true,
              onConfirm: () => {
                d.recordIds.forEach((id) => onDelete('record', id));
                d.foldIds.forEach((id) => onDelete('fold', id));
                setOpen(null);
              },
            })
          }
        />
      ))}
    </View>
  );
}

function Day({
  day,
  heightCm,
  open,
  onToggle,
  onDelete,
}: {
  day: HistoryDay;
  heightCm: number | null;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = day.tape;
  const hasTape = TAPE_ROWS.some(([, k]) => t[k]);
  const tags = [t.weightKg && 'Peso', hasTape && 'Cinta', day.fold && 'Pliegues'].filter(Boolean) as string[];
  const idx = calcIndices(
    {
      id: '',
      date: day.date,
      weightKg: t.weightKg?.value ?? null,
      chestCm: t.chestCm?.value ?? null,
      waistCm: t.waistCm?.value ?? null,
      abdomenCm: t.abdomenCm?.value ?? null,
      hipCm: t.hipCm?.value ?? null,
    },
    heightCm,
  );
  const indices = [
    ['IMC', idx.imc, 1],
    ['Cintura-estatura', idx.ice, 3],
    ['Cintura-cadera', idx.icc, 3],
  ] as const;

  return (
    <View style={styles.day}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${ddmm(day.date)}, ${weekday(day.date)}: ${tags.join(', ')}`}
        onPress={onToggle}
        style={styles.dayTop}>
        <View style={styles.date}>
          <Text style={styles.dateText}>{ddmm(day.date)}</Text>
          <Text style={styles.weekday}>{weekday(day.date)}</Text>
        </View>
        <View style={styles.tags}>
          {tags.map((tag) => (
            <Text key={tag} style={styles.tag}>
              {tag}
            </Text>
          ))}
        </View>
        {t.weightKg ? <Text style={styles.kg}>{fmtNum(t.weightKg.value)} kg</Text> : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>

      {open && (
        <View style={styles.detail}>
          {(t.weightKg || indices.some(([, v]) => v != null)) && (
            <>
              <Text style={styles.group}>PESO E ÍNDICES</Text>
              {t.weightKg && <Line label="Peso" change={t.weightKg} unit="kg" />}
              {indices.map(([label, v, digits]) =>
                v != null ? <Line key={label} label={label} value={fmtNum(v, digits)} /> : null,
              )}
            </>
          )}
          {hasTape && (
            <>
              <Text style={styles.group}>CINTA</Text>
              {TAPE_ROWS.map(([label, k]) => (t[k] ? <Line key={k} label={label} change={t[k]} unit="cm" /> : null))}
            </>
          )}
          {day.fold && (
            <>
              <Text style={styles.group}>PLIEGUES · PROMEDIO DE LAS TOMAS</Text>
              {day.fold.sites.map((s) =>
                s.mm != null ? (
                  <Line key={s.label} label={s.label} change={{ value: s.mm, prev: s.prev }} unit="mm" digits={0} />
                ) : null,
              )}
              {day.fold.pct && <Line label="% de grasa" change={day.fold.pct} unit="pts" suffix=" %" />}
              {day.fold.fatKg != null && day.fold.leanKg != null && (
                <Line label="Grasa · magra" value={`${fmtNum(day.fold.fatKg)} kg · ${fmtNum(day.fold.leanKg)} kg`} />
              )}
            </>
          )}
          <Text style={styles.hint}>Al lado, el cambio desde tu medición anterior de cada dato.</Text>
          <Pressable accessibilityRole="button" onPress={onDelete} style={styles.delete} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={colors.bad} />
            <Text style={styles.deleteText}>Borrar las mediciones de este día</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Line({
  label,
  value,
  change,
  unit = '',
  suffix,
  digits = 1,
}: {
  label: string;
  value?: string;
  change?: Change;
  unit?: string;
  suffix?: string;
  digits?: number;
}) {
  const shown = value ?? (change ? `${fmtNum(change.value, digits)}${suffix ?? ` ${unit}`}` : '—');
  const d = change && change.prev != null ? change.value - change.prev : null;
  // En peso, perímetros, pliegues y % de grasa, bajar es lo deseable.
  const color = d == null || Math.abs(d) < 0.05 ? colors.textMuted : d < 0 ? colors.good : colors.bad;
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{shown}</Text>
      <Text style={[styles.lineDelta, { color }]}>
        {d == null ? '' : Math.abs(d) < 0.05 ? '=' : `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d), digits)} ${unit}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  section: { color: colors.textMuted, ...display(20), marginTop: spacing.sm },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: -4 },
  day: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
  dayTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  date: { width: 62 },
  dateText: { color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  weekday: { color: colors.textMuted, fontSize: 11 },
  tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: {
    color: colors.textMuted,
    fontSize: 11,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  kg: { color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  detail: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  group: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: spacing.md, marginBottom: 2 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  lineLabel: { color: colors.text, fontSize: 14, flex: 1 },
  lineValue: { color: colors.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  lineDelta: { fontSize: 12, fontWeight: '700', width: 76, textAlign: 'right', fontVariant: ['tabular-nums'] },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: spacing.md },
  delete: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, alignSelf: 'flex-start' },
  deleteText: { color: colors.bad, fontSize: 13, fontWeight: '700' },
});
