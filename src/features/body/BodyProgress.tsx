import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { fmtNum, type FoldRecord, type TapeRecord } from '@/domain/body';
import {
  compositionChange,
  daysBetween,
  type Medal,
  type Meter,
  medals,
  meters,
  tapeChange,
} from '@/domain/bodyProgress';
import type { Sex } from '@/domain/schema';
import { colors, display, radius, spacing } from '@/theme';

// «Tu avance»: cuatro miradas al cambio desde el primer registro. Muestra también lo que
// retrocede, con su color; las medallas solo celebran lo logrado.

type Props = {
  records: TapeRecord[];
  folds: FoldRecord[];
  profile: { sex: Sex | null; birthDate: string | null; heightCm: number | null };
};

const ddmm = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
const signed = (n: number, unit: string, digits = 1) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n), digits)} ${unit}`;

export function BodyProgress({ records, folds, profile }: Props) {
  const comp = compositionChange(records, folds, profile.birthDate);
  const tape = tapeChange(records);
  const ms = meters(records, folds, profile);
  const md = medals(records, folds, profile);
  // Sin un segundo registro no hay avance que contar.
  if (!comp && !tape && !ms.some((m) => m.start != null) && !md.some((m) => m.earned)) return null;

  return (
    <View style={styles.wrap} testID="body-progress">
      <Text style={styles.section}>Tu avance</Text>
      {comp && <Composition comp={comp} />}
      {tape && <Tape tape={tape} />}
      {ms.length > 0 && <Meters list={ms} />}
      {md.length > 0 && <Medals list={md} />}
    </View>
  );
}

function Card({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      {children}
    </View>
  );
}

// ---------- 1. Lo que la balanza no ve ----------

function Composition({ comp }: { comp: NonNullable<ReturnType<typeof compositionChange>> }) {
  const moved = (n: number) => (Math.abs(n) < 0.05 ? 'no cambió' : `${n < 0 ? 'bajó' : 'subió'} ${fmtNum(Math.abs(n))} kg`);
  return (
    <Card
      eyebrow="LO QUE LA BALANZA NO VE"
      title={`La balanza ${moved(comp.weight)}. La grasa ${moved(comp.fat)}.`}
      sub={`Del ${ddmm(comp.from)} al ${ddmm(comp.to)}, con el peso más cercano a cada medición de pliegues.`}>
      <View style={styles.tiles}>
        <Stat label="Balanza" value={signed(comp.weight, 'kg')} color={colors.text} line={colors.textMuted} points={comp.series.map((p) => p.weight)} />
        <Stat
          label="Grasa"
          value={signed(comp.fat, 'kg')}
          color={comp.fat <= 0 ? colors.good : colors.bad}
          line={colors.accent}
          points={comp.series.map((p) => p.fat)}
        />
        <Stat
          label="Masa magra"
          value={signed(comp.lean, 'kg')}
          color={comp.lean >= 0 ? colors.good : colors.bad}
          line={colors.low}
          points={comp.series.map((p) => p.lean)}
        />
      </View>
      <Text style={styles.note}>
        El caliper tiene error de pinza: fíjate en la tendencia de varias mediciones, no en un solo cambio.
      </Text>
    </Card>
  );
}

function Stat({ label, value, color, line, points }: { label: string; value: string; color: string; line: string; points: number[] }) {
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const xy = points.map((v, i) => {
    const x = 6 + (i / Math.max(1, points.length - 1)) * 88;
    const y = hi > lo ? 4 + (1 - (v - lo) / (hi - lo)) * 20 : 14;
    return [x, y] as const;
  });
  const [lx, ly] = xy[xy.length - 1];
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Svg width="100%" height={28} viewBox="0 0 100 28">
        <Polyline
          points={xy.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={line}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={lx} cy={ly} r={3.5} fill={line} />
      </Svg>
    </View>
  );
}

// ---------- 2. La cinta se cierra ----------

function Tape({ tape }: { tape: NonNullable<ReturnType<typeof tapeChange>> }) {
  const all = tape.rows.flatMap((r) => [r.from, r.to]);
  const pad = Math.max(2, (Math.max(...all) - Math.min(...all)) * 0.15);
  const lo = Math.min(...all) - pad;
  const hi = Math.max(...all) + pad;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%` as const;
  const days = daysBetween(tape.from, tape.to);
  const total = tape.total;
  return (
    <Card
      eyebrow="LA CINTA SE CIERRA"
      title={
        Math.abs(total) < 0.05
          ? 'Tus medidas se mantienen'
          : `${signed(total, 'cm')} en total, en ${days} ${days === 1 ? 'día' : 'días'}`
      }
      sub={`Gris, la primera medición (${ddmm(tape.from)}). Color, la última (${ddmm(tape.to)}).`}>
      {tape.rows.map((r) => {
        const d = r.to - r.from;
        const c = Math.abs(d) < 0.05 ? colors.textMuted : d < 0 ? colors.good : colors.bad;
        const left = Math.min(r.from, r.to);
        return (
          <View key={r.label} style={styles.tapeRow} accessibilityLabel={`${r.label}: de ${fmtNum(r.from)} a ${fmtNum(r.to)} cm`}>
            <Text style={styles.tapeLabel}>{r.label}</Text>
            <View style={styles.track}>
              <View style={[styles.link, { left: pos(left), width: `${(Math.abs(d) / (hi - lo)) * 100}%` }]} />
              <View style={[styles.dot, { left: pos(r.from), backgroundColor: colors.textMuted }]} />
              <View style={[styles.dot, { left: pos(r.to), backgroundColor: c }]} />
            </View>
            <Text style={[styles.tapeDelta, { color: c }]}>{signed(d, 'cm')}</Text>
          </View>
        );
      })}
    </Card>
  );
}

// ---------- 3. Camino al verde ----------

function Meters({ list }: { list: Meter[] }) {
  return (
    <Card
      eyebrow="CAMINO AL VERDE"
      title="Dónde partiste y cuánto falta"
      sub="Círculo vacío: tu inicio. Círculo lleno: hoy.">
      {list.map((m) => (
        <MeterRow key={m.key} m={m} />
      ))}
    </Card>
  );
}

function MeterRow({ m }: { m: Meter }) {
  const [a, b] = m.cuts;
  const vals = [a, b, m.now, ...(m.start != null ? [m.start] : [])];
  const span = b - a;
  const lo = Math.min(...vals) - span * 0.6;
  const hi = Math.max(...vals) + span * 0.6;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const fmt = (v: number) => `${fmtNum(v, m.digits)}${m.unit}`;
  const worse = m.trend === 'worse';
  const icon: ComponentProps<typeof Ionicons>['name'] =
    m.light === 'ok' ? 'checkmark-circle-outline' : worse ? 'alert-circle-outline' : 'flag-outline';
  return (
    <View style={styles.meter} accessibilityLabel={`${m.title}: ${m.start != null ? `de ${fmt(m.start)} a ` : ''}${fmt(m.now)}. ${m.next}`}>
      <View style={styles.meterHead}>
        <Text style={styles.meterTitle}>{m.title}</Text>
        <Text style={styles.meterValues}>
          {m.start != null ? `${fmt(m.start)} → ` : ''}
          <Text style={{ color: colors.text, fontWeight: '800' }}>{fmt(m.now)}</Text>
        </Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.zone, { left: 0, width: `${pct(a)}%`, backgroundColor: colors.good }]} />
        <View style={[styles.zone, { left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%`, backgroundColor: colors.warning }]} />
        <View style={[styles.zone, { left: `${pct(b)}%`, right: 0, backgroundColor: colors.bad }]} />
        {m.start != null && <View style={[styles.mark, styles.markStart, { left: `${pct(m.start)}%` }]} />}
        <View style={[styles.mark, { left: `${pct(m.now)}%`, backgroundColor: colors.text }]} />
      </View>
      <View style={styles.meterNote}>
        <Ionicons name={icon} size={14} color={worse ? colors.bad : m.light === 'ok' ? colors.good : colors.textMuted} />
        <Text style={[styles.note, worse && { color: colors.bad }]}>
          {worse ? 'Subió desde tu inicio. ' : ''}
          {m.next}
        </Text>
      </View>
    </View>
  );
}

// ---------- 4. Medallas ----------

const MEDAL_ICON: Record<Medal['icon'], ComponentProps<typeof Ionicons>['name']> = {
  zone: 'trending-down-outline',
  tape: 'resize-outline',
  fat: 'flame-outline',
  scale: 'scale-outline',
  calendar: 'calendar-outline',
};

function Medals({ list }: { list: Medal[] }) {
  return (
    <Card eyebrow="MEDALLAS" title="Logros que se ganan midiendo" sub="Se encienden solas con tus registros. Las grises son tu próxima meta.">
      <View style={styles.medals}>
        {list.map((m) => (
          <View key={m.id} style={[styles.medal, !m.earned && styles.medalLocked]}>
            <Ionicons name={m.earned ? MEDAL_ICON[m.icon] : 'lock-closed-outline'} size={20} color={m.earned ? colors.good : colors.textMuted} />
            <Text style={[styles.medalText, !m.earned && { color: colors.textMuted }]}>{m.title}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  section: { color: colors.textMuted, ...display(20), marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  eyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.text, ...display(26) },
  sub: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 17, flexShrink: 1 },

  tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  stat: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  statLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  statValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },

  tapeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 30 },
  tapeLabel: { color: colors.text, fontSize: 14, fontWeight: '700', width: 70 },
  track: { flex: 1, height: 14, justifyContent: 'center' },
  link: { position: 'absolute', height: 2, backgroundColor: colors.border, top: 6 },
  dot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, marginLeft: -7, top: 0, borderWidth: 2, borderColor: colors.surface },
  tapeDelta: { fontSize: 13, fontWeight: '800', width: 72, textAlign: 'right', fontVariant: ['tabular-nums'] },

  meter: { gap: 6, marginTop: spacing.xs },
  meterHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  meterTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  meterValues: { color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
  meterTrack: { height: 16, justifyContent: 'center' },
  zone: { position: 'absolute', height: 8, top: 4, opacity: 0.55, borderRadius: 2 },
  mark: { position: 'absolute', width: 16, height: 16, borderRadius: 8, marginLeft: -8, top: 0, borderWidth: 2, borderColor: colors.surface },
  markStart: { backgroundColor: colors.surface, borderColor: colors.textMuted },
  meterNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },

  medals: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  medal: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  medalLocked: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  medalText: { color: colors.text, fontSize: 13, fontWeight: '700', flexShrink: 1, lineHeight: 18 },
});
