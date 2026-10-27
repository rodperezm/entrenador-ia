import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
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
  type Light,
  LIGHT_LABEL,
  type TapeRecord,
  weightNear,
} from '@/domain/body';
import { useBody } from '@/state/body';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

const LIGHT_COLOR: Record<Light, string> = { ok: '#2EBD6B', warn: '#F5B700', bad: '#E5484D', na: colors.border };
const FAT_COLOR = { thin: '#6FA6D6', ok: '#2EBD6B', warn: '#F5B700', bad: '#E5484D', na: colors.border };

const fmtDate = (iso: string) => iso.split('-').reverse().join('-');

export default function BodyScreen() {
  const { profile } = useProfile();
  const { records, folds, remove } = useBody();
  if (!profile) return null;

  const missingProfile = !profile.sex || !profile.birthDate || !profile.heightCm;
  const last = records[0] as TapeRecord | undefined;
  const prev = records[1] as TapeRecord | undefined;
  const idx = last ? calcIndices(last, profile.heightCm) : null;
  const imcCls = clsIMC(idx?.imc ?? null);

  const lastFold = folds[0];
  const fat = lastFold ? bodyFat(lastFold, profile.birthDate) : null;
  const fatCls = lastFold && fat ? clsFat(fat.pct, lastFold.sex, fat.age) : 'na';
  const fatWeight = lastFold ? weightNear(records, lastFold.date) : null;
  const fatMass = fat?.pct != null && fatWeight ? (fatWeight * fat.pct) / 100 : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {missingProfile && (
        <Link href="/onboarding" asChild>
          <Pressable style={styles.notice}>
            <Text style={styles.noticeText}>
              Completa tu sexo, fecha de nacimiento y altura en tu perfil para calcular el IMC y el % de grasa.
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </Pressable>
        </Link>
      )}

      {/* IMC con semáforo */}
      <View style={styles.hero}>
        <View style={styles.lights}>
          {(['bad', 'warn', 'ok'] as const).map((l) => (
            <View
              key={l}
              style={[styles.light, { backgroundColor: imcCls === l ? LIGHT_COLOR[l] : colors.surfaceAlt }]}
            />
          ))}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heroLabel}>IMC {last ? `· ${fmtDate(last.date)}` : ''}</Text>
          <Text style={styles.heroValue}>
            {fmtNum(idx?.imc ?? null)}
            <Text style={styles.heroUnit}> kg/m²</Text>
          </Text>
          <Text style={[styles.pill, { color: LIGHT_COLOR[imcCls] }]}>
            {imcCls === 'na'
              ? last
                ? 'Falta altura o peso'
                : 'Sin registros'
              : imcCls === 'ok'
                ? 'Bajo 25 · verde'
                : imcCls === 'warn'
                  ? 'Entre 25 y 30 · amarillo'
                  : 'Sobre 30 · rojo'}
          </Text>
        </View>
        {last?.weightKg != null && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.heroLabel}>Peso</Text>
            <Text style={styles.weight}>{fmtNum(last.weightKg)} kg</Text>
            <Delta cur={last.weightKg} prev={prev?.weightKg ?? null} unit="kg" />
          </View>
        )}
      </View>

      {/* Índices */}
      <View style={styles.tiles}>
        <Tile
          title="ICC · cintura / cadera"
          value={fmtNum(idx?.icc ?? null, 2)}
          light={clsICC(idx?.icc ?? null, profile.sex)}
          note={`Ideal: bajo ${fmtNum(iccIdeal(profile.sex), 2)}`}
        />
        <Tile
          title="ICE · cintura / altura"
          value={fmtNum(idx?.ice ?? null, 2)}
          light={clsICE(idx?.ice ?? null)}
          note="Ideal: bajo 0,50"
        />
        <Tile
          title="Abdomen − cintura"
          value={idx?.dif != null ? `${fmtNum(idx.dif)} cm` : '—'}
          light={clsDif(idx?.dif ?? null)}
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

      {/* Medidas */}
      {last && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Medidas · {fmtDate(last.date)}</Text>
          {(
            [
              ['Tórax', 'chestCm'],
              ['Cintura', 'waistCm'],
              ['Abdomen', 'abdomenCm'],
              ['Cadera', 'hipCm'],
            ] as const
          ).map(([label, key]) => (
            <View key={key} style={styles.measureRow}>
              <Text style={styles.measureLabel}>{label}</Text>
              <Text style={styles.measureValue}>{last[key] != null ? `${fmtNum(last[key])} cm` : '—'}</Text>
              <Delta cur={last[key]} prev={prev?.[key] ?? null} unit="cm" />
            </View>
          ))}
        </View>
      )}

      <Link href={{ pathname: '/guide' }} asChild>
        <Pressable style={styles.guideLink}>
          <Ionicons name="book-outline" size={20} color={colors.accent} />
          <Text style={styles.guideText}>Guía de medición: cómo medir y qué significa cada índice</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </Link>

      <View style={styles.actions}>
        <Link href={{ pathname: '/body/new', params: { type: 'tape' } }} asChild>
          <Pressable style={styles.action}>
            <Ionicons name="resize-outline" size={22} color="#fff" />
            <Text style={styles.actionText}>Peso y medidas</Text>
          </Pressable>
        </Link>
        <Link href={{ pathname: '/body/new', params: { type: 'folds' } }} asChild>
          <Pressable style={StyleSheet.flatten([styles.action, styles.actionAlt])}>
            <Ionicons name="analytics-outline" size={22} color={colors.text} />
            <Text style={[styles.actionText, { color: colors.text }]}>Pliegues</Text>
          </Pressable>
        </Link>
      </View>

      {/* Historial */}
      {(records.length > 0 || folds.length > 0) && <Text style={styles.section}>Historial</Text>}
      {records.map((r) => {
        const c = calcIndices(r, profile.heightCm);
        return (
          <HistoryRow
            key={r.id}
            date={r.date}
            text={[
              r.weightKg != null ? `${fmtNum(r.weightKg)} kg` : null,
              c.imc != null ? `IMC ${fmtNum(c.imc)}` : null,
              r.waistCm != null ? `cintura ${fmtNum(r.waistCm)}` : null,
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
    <View style={styles.tile}>
      <View style={styles.tileHead}>
        <View style={[styles.dot, { backgroundColor: color ?? LIGHT_COLOR[light] }]} />
        <Text style={styles.tileTitle}>{title}</Text>
      </View>
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
      <Pressable onPress={onDelete} hitSlop={10}>
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
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  lights: { backgroundColor: colors.bg, borderRadius: 14, padding: 6, gap: 6 },
  light: { width: 22, height: 22, borderRadius: 11 },
  heroLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  heroValue: { color: colors.text, fontSize: 36, fontWeight: '900' },
  heroUnit: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  pill: { fontSize: 13, fontWeight: '700' },
  weight: { color: colors.text, fontSize: 18, fontWeight: '800' },
  delta: { fontSize: 12, fontWeight: '700', minWidth: 64, textAlign: 'right' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '48.5%', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tileTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', flex: 1 },
  tileValue: { color: colors.text, fontSize: 22, fontWeight: '900' },
  tileNote: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  measureRow: { flexDirection: 'row', alignItems: 'center' },
  measureLabel: { color: colors.textMuted, fontSize: 14, flex: 1 },
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
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 14,
  },
  actionAlt: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionText: { color: '#fff', fontWeight: '800' },
  section: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: spacing.sm },
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
