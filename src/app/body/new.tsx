import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardDoneBar } from '@/components/KeyboardDoneBar';
import { Button } from '@/components/ui';
import {
  bodyFat,
  calcIndices,
  clsFat,
  clsIMC,
  FAT_LABEL,
  FOLD_SITES,
  fmtNum,
  LIGHT_LABEL,
  todayISO,
} from '@/domain/body';
import { DateField } from '@/components/DateField';
import { useBody } from '@/state/body';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

// Acepta coma decimal ("88,5"). Vacío → null; inválido → NaN.
const num = (s: string) => {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const inRange = (v: number | null, min: number, max: number) => v == null || (!Number.isNaN(v) && v >= min && v <= max);

const TAPE_FIELDS = [
  { key: 'weightKg', label: 'Peso', unit: 'kg', min: 20, max: 400, placeholder: '78,4' },
  { key: 'chestCm', label: 'Tórax', unit: 'cm', min: 30, max: 250, placeholder: '102' },
  { key: 'waistCm', label: 'Cintura', unit: 'cm', min: 30, max: 250, placeholder: '88,5' },
  { key: 'abdomenCm', label: 'Abdomen', unit: 'cm', min: 30, max: 250, placeholder: '94' },
  { key: 'hipCm', label: 'Cadera', unit: 'cm', min: 30, max: 250, placeholder: '100' },
] as const;
type TapeKey = (typeof TAPE_FIELDS)[number]['key'];

export default function NewBodyRecord() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const folds = type === 'folds';
  const { profile } = useProfile();
  const { saveRecord, saveFold } = useBody();
  const [date, setDate] = useState(todayISO());
  const [tape, setTape] = useState<Record<TapeKey, string>>({
    weightKg: '',
    chestCm: '',
    waistCm: '',
    abdomenCm: '',
    hipCm: '',
  });
  const [takes, setTakes] = useState<Record<string, string[]>>({});

  // La fecha del registro no puede ser futura.
  const recordDate = date <= todayISO() ? date : null;

  const sex = profile?.sex ?? null;

  if (folds && !sex) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Para registrar pliegues necesitamos tu sexo y fecha de nacimiento en tu perfil.</Text>
        <Button label="Ir a mi perfil" onPress={() => router.replace('/onboarding')} />
      </View>
    );
  }

  // --- Medidas ---
  const values = Object.fromEntries(TAPE_FIELDS.map((f) => [f.key, num(tape[f.key])])) as Record<
    TapeKey,
    number | null
  >;
  const tapeValid = TAPE_FIELDS.every((f) => inRange(values[f.key], f.min, f.max));
  const anyTape = TAPE_FIELDS.some((f) => values[f.key] != null);
  const preview = calcIndices({ id: '', date: recordDate ?? todayISO(), ...values }, profile?.heightCm ?? null);

  // --- Pliegues ---
  const sites = sex ? FOLD_SITES[sex] : [];
  const siteValues = Object.fromEntries(
    sites.map((s) => [s.id, (takes[s.id] ?? []).map(num).filter((v): v is number => v != null && !Number.isNaN(v))]),
  );
  const foldsValid = sites.every((s) => (takes[s.id] ?? []).every((t) => inRange(num(t), 1, 80)));
  const allSites = sites.every((s) => siteValues[s.id].length > 0);
  const fat = sex
    ? bodyFat({ id: '', date: recordDate ?? todayISO(), sex, sites: siteValues }, profile?.birthDate ?? null)
    : null;

  const canSave = !!recordDate && (folds ? foldsValid && allSites : tapeValid && anyTape);

  const save = () => {
    if (!recordDate) return;
    if (folds && sex) saveFold({ date: recordDate, sex, sites: siteValues });
    else saveRecord({ date: recordDate, ...values });
    router.back();
  };

  return (
    <>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Stack.Screen options={{ title: folds ? 'Registrar pliegues' : 'Registrar medidas' }} />
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.field}>
            <Text style={styles.fieldLabel} numberOfLines={1}>
              Fecha
            </Text>
            <View style={styles.fieldInputRow}>
              <View style={{ flex: 1 }}>
                <DateField value={date} onChange={setDate} maximumDate={new Date()} invalid={!recordDate} />
              </View>
              <Text style={styles.unit} />
            </View>
          </View>

          <Link href={{ pathname: '/guide', params: { tab: folds ? 'folds' : 'tape' } }} asChild>
            <Pressable style={styles.guideLink}>
              <Ionicons name="book-outline" size={20} color={colors.accent} />
              <Text style={styles.guideText}>
                {folds ? '¿Cómo medir los pliegues? Ver la guía' : '¿Dónde va la cinta? Ver la guía'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </Link>

          {!folds ? (
            <>
              {TAPE_FIELDS.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  unit={f.unit}
                  value={tape[f.key]}
                  onChange={(v) => setTape((t) => ({ ...t, [f.key]: v }))}
                  placeholder={f.placeholder}
                  error={!inRange(values[f.key], f.min, f.max)}
                  decimal
                />
              ))}
              <Text style={styles.hint}>
                Todo es opcional: registra solo lo que mediste. Cintura: el punto más estrecho, entre costillas y
                cadera.
              </Text>
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>IMC calculado</Text>
                <Text style={styles.previewValue}>
                  {fmtNum(preview.imc)} {preview.imc != null ? `· ${LIGHT_LABEL[clsIMC(preview.imc)]}` : ''}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                Jackson-Pollock 3 pliegues. Mide del lado derecho y anota lo que marca el caliper en milímetros (mm), de
                1 a 80. Repite cada pliegue 2 o 3 veces: se promedian para reducir el error de pinza.
              </Text>
              {sites.map((s) => (
                <View key={s.id} style={styles.site}>
                  <Text style={styles.siteTitle}>{s.label}</Text>
                  <Text style={styles.hint}>{s.how}</Text>
                  <View style={styles.takes}>
                    {[0, 1, 2].map((i) => {
                      const v = takes[s.id]?.[i] ?? '';
                      return (
                        <TextInput
                          key={i}
                          value={v}
                          onChangeText={(t) =>
                            setTakes((all) => {
                              const arr = [...(all[s.id] ?? ['', '', ''])];
                              arr[i] = t;
                              return { ...all, [s.id]: arr };
                            })
                          }
                          placeholder={`Toma ${i + 1}`}
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                          style={[styles.input, styles.takeInput, !inRange(num(v), 1, 80) && styles.inputError]}
                        />
                      );
                    })}
                    <Text style={styles.takeUnit} numberOfLines={1}>
                      mm
                    </Text>
                  </View>
                </View>
              ))}
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>% de grasa (Siri)</Text>
                <Text style={styles.previewValue}>
                  {fat?.pct != null && sex
                    ? `${fmtNum(fat.pct)} % · ${FAT_LABEL[clsFat(fat.pct, sex, fat.age)]}`
                    : profile?.birthDate
                      ? 'Completa los 3 pliegues'
                      : 'Falta tu fecha de nacimiento en el perfil'}
                </Text>
              </View>
            </>
          )}

          <Button label="Guardar" onPress={save} disabled={!canSave} />
        </ScrollView>
      </KeyboardAvoidingView>
      <KeyboardDoneBar />
    </>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  placeholder,
  error,
  decimal,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: boolean;
  decimal?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.fieldInputRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={decimal ? 'decimal-pad' : 'numbers-and-punctuation'}
          style={[styles.input, { flex: 1 }, error && styles.inputError]}
        />
        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  guideLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  guideText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  text: { color: colors.text, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fieldLabel: { color: colors.text, fontSize: 15, fontWeight: '700', width: 96 },
  fieldInputRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unit: { color: colors.textMuted, fontWeight: '700', width: 26 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  inputError: { borderColor: colors.warning },
  preview: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  previewLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  previewValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  site: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  siteTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  takes: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  takeUnit: { color: colors.textMuted, fontWeight: '700', minWidth: 34, flexShrink: 0 },
  takeInput: { flex: 1, textAlign: 'center', backgroundColor: colors.bg },
});
