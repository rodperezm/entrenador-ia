import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  bodyFat,
  calcIndices,
  clsDif,
  clsFat,
  clsICC,
  clsICE,
  clsIMC,
  FAT_LABEL,
  fmtNum,
  iccIdeal,
  latestBody,
  latestRecord,
  type Light,
  LIGHT_LABEL,
  weightNear,
  weightSeries,
} from '@/domain/body';
import { ROUTINE_TONES } from '@/features/routines/tones';
import { useBody } from '@/state/body';
import { useProfile } from '@/state/profile';
import { colors, display, radius, spacing } from '@/theme';

// «Cuerpo» parte por lo que la persona mira primero: su peso y hacia dónde va. Registrar es lo
// segundo, con tres caminos de distinto esfuerzo (solo la balanza, la cinta, el caliper). Los
// índices y el historial quedan abajo, para quien quiere el detalle.

const LIGHT_COLOR: Record<Light, string> = {
  ok: colors.good,
  warn: colors.warning,
  bad: colors.bad,
  na: colors.border,
};
const FAT_COLOR = { thin: colors.low, ...LIGHT_COLOR };
const IMC_TEXT: Record<Light, string> = {
  ok: 'Menos de 25 · en rango',
  warn: 'Entre 25 y 30 · atención',
  bad: 'Más de 30 · alto',
  na: '',
};
const TAPE_ROWS = [
  ['Tórax', 'chestCm'],
  ['Cintura', 'waistCm'],
  ['Abdomen', 'abdomenCm'],
  ['Cadera', 'hipCm'],
] as const;

const fmtDate = (iso: string) => iso.split('-').reverse().join('-');
const shortDate = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
// Dónde cae el IMC en la barra: de 15 a 40, que cubre casi todos los casos.
const imcPosition = (imc: number) => Math.min(100, Math.max(0, ((imc - 15) / 25) * 100));

export default function BodyScreen() {
  const { profile } = useProfile();
  const { records, folds, remove } = useBody();
  if (!profile) return null;

  const missingProfile = !profile.sex || !profile.birthDate || !profile.heightCm;
  // Lo último de cada medida: un registro solo de peso no deja en blanco las medidas de cinta.
  const latest = latestBody(records);
  const idx = calcIndices(latestRecord(latest), profile.heightCm);
  const imcCls = clsIMC(idx.imc);
  const weight = latest.weightKg;
  const series = weightSeries(records);
  const low = Math.min(...series.map((p) => p.kg));
  const high = Math.max(...series.map((p) => p.kg));
  const change = weight?.prev != null ? weight.value - weight.prev : null;
  const steady = change != null && Math.abs(change) < 0.05;

  const lastFold = folds[0];
  const fat = lastFold ? bodyFat(lastFold, profile.birthDate) : null;
  const fatCls = lastFold && fat ? clsFat(fat.pct, lastFold.sex, fat.age) : 'na';
  const fatWeight = lastFold ? weightNear(records, lastFold.date) : null;
  const fatMass = fat?.pct != null && fatWeight ? (fatWeight * fat.pct) / 100 : null;
  const hasTape = TAPE_ROWS.some(([, key]) => latest[key]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {missingProfile && (
        <Link href={{ pathname: '/onboarding', params: { edit: 'about' } }} asChild>
          <Pressable accessibilityRole="link" style={styles.notice}>
            <Text style={styles.noticeText}>
              Completa tu sexo, fecha de nacimiento y altura en tu perfil para calcular el IMC y el % de grasa.
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </Pressable>
        </Link>
      )}

      {/* Peso: lo primero que se mira */}
      <View style={styles.hero} testID="body-weight">
        <Text style={styles.heroLabel}>Tu peso{weight ? ` · ${fmtDate(weight.date)}` : ''}</Text>
        {weight ? (
          <View style={styles.heroRow}>
            <View style={styles.heroMain}>
              <Text style={styles.heroValue}>
                {fmtNum(weight.value)}
                <Text style={styles.heroUnit}> kg</Text>
              </Text>
              {change != null && weight.prevDate ? (
                <Text style={styles.change}>
                  <Ionicons
                    name={steady ? 'remove' : change < 0 ? 'arrow-down' : 'arrow-up'}
                    size={14}
                    color={colors.link}
                  />{' '}
                  {steady ? 'Sin cambio' : `${change > 0 ? '+' : ''}${fmtNum(change)} kg`} desde el{' '}
                  {shortDate(weight.prevDate)}
                </Text>
              ) : (
                <Text style={styles.change}>Primer registro. Con el siguiente verás el cambio.</Text>
              )}
            </View>
            {series.length > 1 && (
              <View style={styles.spark} accessibilityLabel={`Tus últimos ${series.length} pesos`}>
                {series.map((point, i) => (
                  <View
                    key={point.date}
                    style={[
                      styles.sparkBar,
                      { height: 14 + (high > low ? ((point.kg - low) / (high - low)) * 42 : 21) },
                      i === series.length - 1 && styles.sparkBarNow,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.heroEmpty}>Registra tu peso para empezar. Toma 10 segundos.</Text>
        )}

        {idx.imc != null ? (
          <View style={styles.imc}>
            <View style={styles.imcHead}>
              <Text style={styles.imcValue}>IMC {fmtNum(idx.imc)}</Text>
              <Text style={[styles.imcText, { color: LIGHT_COLOR[imcCls] }]}>{IMC_TEXT[imcCls]}</Text>
            </View>
            <View style={styles.scale}>
              <View style={[styles.scalePart, { flex: 10, backgroundColor: colors.good }]} />
              <View style={[styles.scalePart, { flex: 5, backgroundColor: colors.warning }]} />
              <View style={[styles.scalePart, { flex: 10, backgroundColor: colors.bad }]} />
              <View style={[styles.marker, { left: `${imcPosition(idx.imc)}%` }]} />
            </View>
          </View>
        ) : weight ? (
          <Text style={styles.change}>Agrega tu altura en el perfil para ver tu IMC.</Text>
        ) : null}
      </View>

      {/* Registrar: tres caminos, del más simple al más completo */}
      <Text style={styles.section}>Registrar</Text>
      <View style={styles.entries}>
        <Entry
          type="weight"
          tone="accent"
          icon="scale-outline"
          title="Solo el peso"
          note="La balanza y nada más · 10 segundos"
          wide
        />
        <Entry
          type="tape"
          tone="blue"
          icon="resize-outline"
          title="Con cinta"
          note="Tórax, cintura, abdomen y cadera"
        />
        <Entry
          type="folds"
          tone="violet"
          icon="analytics-outline"
          title="Pliegues"
          note="% de grasa con caliper · pide tu peso"
        />
      </View>

      {/* Índices */}
      <Text style={styles.section}>Tus índices</Text>
      <View style={styles.tiles}>
        <Tile
          title="ICC · cintura / cadera"
          value={fmtNum(idx.icc, 2)}
          light={clsICC(idx.icc, profile.sex)}
          note={`Ideal: menos de ${fmtNum(iccIdeal(profile.sex), 2)}`}
        />
        <Tile
          title="ICE · cintura / altura"
          value={fmtNum(idx.ice, 2)}
          light={clsICE(idx.ice)}
          note="Ideal: menos de 0,50"
        />
        <Tile
          title="Abdomen − cintura"
          value={idx.dif != null ? `${fmtNum(idx.dif)} cm` : '—'}
          light={clsDif(idx.dif)}
          note="Con poca grasa: 2 a 5 cm"
        />
        <Tile
          title="% de grasa (pliegues)"
          value={fat?.pct != null ? `${fmtNum(fat.pct)} %` : '—'}
          light={fatCls === 'ok' ? 'ok' : fatCls === 'warn' ? 'warn' : fatCls === 'bad' ? 'bad' : 'na'}
          color={FAT_COLOR[fatCls]}
          note={
            fat?.pct != null
              ? `${FAT_LABEL[fatCls]}${fatMass != null && fatWeight ? ` · ${fmtNum(fatMass)} kg grasa · ${fmtNum(fatWeight - fatMass)} kg magra` : ''}`
              : 'Registra tus pliegues con caliper'
          }
        />
      </View>

      {/* Medidas de cinta: lo último de cada una, con su fecha */}
      {hasTape && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tus medidas</Text>
          {TAPE_ROWS.map(([label, key]) => {
            const m = latest[key];
            return (
              <View key={key} style={styles.measureRow}>
                <View style={styles.measureName}>
                  <Text style={styles.measureLabel}>{label}</Text>
                  {m ? <Text style={styles.measureDate}>{fmtDate(m.date)}</Text> : null}
                </View>
                <Text style={styles.measureValue}>{m ? `${fmtNum(m.value)} cm` : '—'}</Text>
                <Delta cur={m?.value ?? null} prev={m?.prev ?? null} unit="cm" />
              </View>
            );
          })}
        </View>
      )}

      <Link href={{ pathname: '/guide' }} asChild>
        <Pressable accessibilityRole="link" style={styles.guideLink}>
          <Ionicons name="book-outline" size={20} color={colors.accent} />
          <Text style={styles.guideText}>Guía de medición: cómo medir y qué significa cada índice</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </Link>

      {/* Historial */}
      {(records.length > 0 || folds.length > 0) && <Text style={styles.section}>Historial</Text>}
      {records.map((r) => {
        const c = calcIndices(r, profile.heightCm);
        const tape = TAPE_ROWS.filter(([, key]) => r[key] != null).length;
        return (
          <HistoryRow
            key={r.id}
            date={r.date}
            text={[
              r.weightKg != null ? `${fmtNum(r.weightKg)} kg` : null,
              c.imc != null ? `IMC ${fmtNum(c.imc)}` : null,
              r.waistCm != null
                ? `cintura ${fmtNum(r.waistCm)}`
                : tape
                  ? `${tape} ${tape === 1 ? 'medida' : 'medidas'}`
                  : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            light={clsIMC(c.imc)}
            onDelete={() => remove('record', r.id)}
          />
        );
      })}
      {folds.map((f) => {
        const b = bodyFat(f, profile.birthDate);
        return (
          <HistoryRow
            key={f.id}
            date={f.date}
            text={`Pliegues · ${b.pct != null ? `${fmtNum(b.pct)} % grasa` : 'incompleto'}`}
            light="na"
            onDelete={() => remove('fold', f.id)}
          />
        );
      })}
    </ScrollView>
  );
}

function Entry({
  type,
  tone,
  icon,
  title,
  note,
  wide,
}: {
  type: 'weight' | 'tape' | 'folds';
  tone: keyof typeof ROUTINE_TONES;
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  note: string;
  wide?: boolean;
}) {
  const t = ROUTINE_TONES[tone];
  return (
    <Link href={{ pathname: '/body/new', params: { type } }} asChild>
      <Pressable
        accessibilityRole="link"
        testID={`body-add-${type}`}
        // Un solo estilo: el enlace de Expo Router no acepta una lista de estilos en su hijo.
        style={StyleSheet.flatten([styles.entry, wide && styles.entryWide, { backgroundColor: t.bg }])}>
        <Ionicons name={icon} size={wide ? 28 : 24} color={t.vivid} />
        <View style={styles.entryText}>
          <Text style={[styles.entryTitle, wide && styles.entryTitleWide, { color: t.text }]}>{title}</Text>
          <Text style={[styles.entryNote, { color: t.sub }]}>{note}</Text>
        </View>
        {wide && <Ionicons name="add-circle" size={30} color={t.vivid} />}
      </Pressable>
    </Link>
  );
}

function Delta({ cur, prev, unit }: { cur: number | null; prev: number | null; unit: string }) {
  if (cur == null || prev == null) return <View style={{ width: 64 }} />;
  const d = cur - prev;
  // En peso y perímetros, bajar es lo deseable.
  const color = Math.abs(d) < 0.05 ? colors.textMuted : d < 0 ? LIGHT_COLOR.ok : LIGHT_COLOR.bad;
  return (
    <Text style={[styles.delta, { color }]}>
      {d > 0 ? '+' : ''}
      {fmtNum(d)} {unit}
    </Text>
  );
}

function Tile({
  title,
  value,
  light,
  note,
  color,
}: {
  title: string;
  value: string;
  light: Light;
  note: string;
  color?: string;
}) {
  return (
    <View style={[styles.tile, { borderTopColor: color ?? LIGHT_COLOR[light] }]}>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileNote}>
        {light === 'na' && value === '—' ? note : `${color ? '' : `${LIGHT_LABEL[light]} · `}${note}`}
      </Text>
    </View>
  );
}

function HistoryRow({
  date,
  text,
  light,
  onDelete,
}: {
  date: string;
  text: string;
  light: Light;
  onDelete: () => void;
}) {
  return (
    <View style={styles.histRow}>
      <View style={[styles.dot, { backgroundColor: LIGHT_COLOR[light] }]} />
      <Text style={styles.histDate} numberOfLines={1}>
        {fmtDate(date)}
      </Text>
      <Text style={styles.histText} numberOfLines={1}>
        {text}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Borrar esta medida" onPress={onDelete} hitSlop={10}>
        <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: { flex: 1, color: colors.warning, fontSize: 13, lineHeight: 18 },
  section: { color: colors.textMuted, ...display(20), marginTop: spacing.sm },

  hero: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  heroLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  heroMain: { flex: 1, gap: spacing.xs },
  heroValue: { color: colors.text, ...display(72) },
  heroUnit: { ...display(28), color: colors.textMuted },
  heroEmpty: { color: colors.text, fontSize: 16, lineHeight: 23 },
  change: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 56 },
  sparkBar: { width: 10, borderRadius: 3, backgroundColor: colors.border },
  sparkBarNow: { backgroundColor: colors.accent },
  imc: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  imcHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  imcValue: { color: colors.text, ...display(24) },
  imcText: { fontSize: 13, fontWeight: '700' },
  scale: { flexDirection: 'row', gap: 3, height: 8 },
  scalePart: { borderRadius: 4, opacity: 0.55 },
  marker: {
    position: 'absolute',
    top: -4,
    width: 6,
    height: 16,
    marginLeft: -3,
    borderRadius: 3,
    backgroundColor: colors.text,
  },

  entries: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  entry: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 124,
    borderRadius: radius.lg,
    padding: spacing.lg,
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  entryWide: { flexBasis: '100%', minHeight: 0, flexDirection: 'row', alignItems: 'center' },
  entryText: { flexShrink: 1, flexGrow: 1, gap: 2 },
  entryTitle: { ...display(24) },
  entryTitleWide: { ...display(30) },
  entryNote: { fontSize: 13, lineHeight: 18 },

  delta: { fontSize: 12, fontWeight: '700', minWidth: 64, textAlign: 'right' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48.5%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderTopWidth: 3,
    padding: spacing.md,
    gap: 4,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tileTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  tileValue: { color: colors.text, ...display(30) },
  tileNote: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  cardTitle: { color: colors.textMuted, ...display(20) },
  measureRow: { flexDirection: 'row', alignItems: 'center' },
  measureName: { flex: 1 },
  measureLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  measureDate: { color: colors.textMuted, fontSize: 12 },
  measureValue: { color: colors.text, fontSize: 15, fontWeight: '700', minWidth: 80, textAlign: 'right' },
  guideLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  guideText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  histDate: { color: colors.text, fontSize: 13, fontWeight: '700', width: 92 },
  histText: { color: colors.textMuted, fontSize: 13, flex: 1 },
});
