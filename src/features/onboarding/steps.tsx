import { BebasNeue_400Regular, useFonts } from '@expo-google-fonts/bebas-neue';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateField } from '@/components/DateField';
import { Button, CheckRow, OptionCard, Stepper } from '@/components/ui';
import { EXERCISES } from '@/data/exercises.seed';
import {
  EQUIPMENT,
  type EquipmentId,
  MEDICAL_CONDITIONS,
  PARK_EQUIPMENT,
  PARK_EQUIPMENT_IDS,
  RESTRICTION_FLAG_IDS,
  RESTRICTION_FLAGS,
  type RestrictionFlagId,
} from '@/domain/catalog';
import { filterExercisesForUser } from '@/domain/filter';
import { CLOUD_BACKUP_READY } from '@/lib/cloudSync';
import { BLOCK_LABELS } from '@/domain/labels';
import type { BlockType, DayOfWeek, LocalProfile, Sex } from '@/domain/schema';
import {
  DAY_PARTS,
  type DayPart,
  type DayChoice,
  dayChoiceLabel,
  dayPartLabel,
  DAYS,
  proposeWeek,
  canBeGentle,
  toggleDayPart,
} from '@/domain/week';
import { colors, radius, spacing } from '@/theme';

export type Level = LocalProfile['level'];
export type Draft = {
  displayName: string;
  disclaimerAccepted: boolean;
  level: Level | null;
  equipment: EquipmentId[];
  parkEquipment: EquipmentId[]; // lo que hay fijo en su parque
  kettlebellWeightsKg: number[];
  conditions: LocalProfile['conditions'];
  sex: Sex | null;
  birthText: string; // como lo escribe el usuario: DD-MM-AAAA
  heightText: string; // en cm
  weekChoices: Record<DayOfWeek, DayChoice>;
  gentleDays: DayOfWeek[]; // días de lesión con fuerza suave
  weekMinutes: Record<DayOfWeek, number>; // tiempo disponible por día
  partCounts: Record<DayPart, number>; // ejercicios por parte
  isNew: boolean; // primera vez: el perfil parte con lo mínimo y la semana propuesta
};
type StepProps = { draft: Draft; update: (patch: Partial<Draft>) => void };

export const BASE_EQUIPMENT: EquipmentId[] = ['mat', 'kettlebell'];
const OPTIONAL_EQUIPMENT = (Object.keys(EQUIPMENT) as EquipmentId[]).filter((e) => !BASE_EQUIPMENT.includes(e));
const KB_WEIGHTS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32];

export const PART_MAX: Record<DayPart, number> = { warmup: 8, prehab: 6, main: 10, cooldown: 8 };

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

// ---------- Portada (antes del paso 1, solo la primera vez) ----------

export function IntroScreen({ onStart }: { onStart: () => void }) {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  const display = fontsLoaded ? { fontFamily: 'BebasNeue_400Regular' } : styles.displayFallback;

  return (
    <View style={[styles.intro, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
      <ScrollView contentContainerStyle={styles.introContent}>
        <Image source={require('../../../assets/icon.png')} style={styles.introLogo} accessibilityLabel="Logo de KettleIA" />
        <Text style={[styles.introBrand, display]}>KettleIA</Text>
        <Text style={[styles.introHeadline, display]}>Entrena fuerte.{'\n'}Cuida lo que duele.</Text>
        <Text style={styles.introBody}>
          La fuerza es la madre de todas las batallas. Solo necesitas una kettlebell, tu cuerpo y un plan que respeta tus
          lesiones.
        </Text>
      </ScrollView>
      <Button label="Empezar" onPress={onStart} />
      {CLOUD_BACKUP_READY && (
        <Button label="Ya tengo cuenta" variant="ghost" onPress={() => router.push('/account')} />
      )}
    </View>
  );
}

// ---------- 1. Bienvenida ----------

export function WelcomeStep({ draft, update }: StepProps) {
  return (
    <View style={styles.gap}>
      <Text style={styles.label}>¿Cómo te llamamos? (opcional)</Text>
      <TextInput
        value={draft.displayName}
        onChangeText={(displayName) => update({ displayName })}
        placeholder="Tu nombre"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        autoCapitalize="words"
      />
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerTitle}>Antes de empezar</Text>
        <Text style={styles.body}>
          Esta app propone ejercicios según la información que tú indicas. No reemplaza la evaluación ni la indicación
          de un médico, kinesiólogo o profesional de la salud. Si sientes dolor durante un ejercicio, detente.
        </Text>
      </View>
      <CheckRow
        label="Entiendo y acepto que entreno bajo mi propia responsabilidad."
        checked={draft.disclaimerAccepted}
        onPress={() => update({ disclaimerAccepted: !draft.disclaimerAccepted })}
      />
    </View>
  );
}

// ---------- 2. Sobre ti ----------

// "27-10-1985" → "1985-10-27"; null si no es una fecha válida y razonable.
export function parseBirth(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  const age = new Date().getUTCFullYear() - y;
  if (date.getUTCDate() !== d || date.getUTCMonth() !== mo - 1 || age < 12 || age > 100) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseHeight(text: string): number | null {
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) && n >= 100 && n <= 250 ? n : null;
}

export const formatBirth = (iso: string | null) => (iso ? iso.split('-').reverse().join('-') : '');

export function AboutStep({ draft, update }: StepProps) {
  const birthOk = !draft.birthText || parseBirth(draft.birthText) != null;
  const heightOk = !draft.heightText || parseHeight(draft.heightText) != null;
  return (
    <View style={styles.gap}>
      <Text style={styles.label}>Sexo</Text>
      <View style={styles.row2}>
        {(
          [
            ['male', 'Hombre'],
            ['female', 'Mujer'],
          ] as const
        ).map(([id, label]) => (
          <View key={id} style={{ flex: 1 }}>
            <OptionCard title={label} selected={draft.sex === id} onPress={() => update({ sex: id })} />
          </View>
        ))}
      </View>
      <Text style={styles.hint}>Define las figuras que explican los movimientos y tus índices corporales.</Text>

      <Text style={styles.label}>Fecha de nacimiento (opcional)</Text>
      <DateField
        value={parseBirth(draft.birthText)}
        onChange={(iso) => update({ birthText: formatBirth(iso) })}
        placeholder="Elegir fecha"
        initialDate={new Date(1985, 0, 1)}
        minimumDate={new Date(new Date().getFullYear() - 100, 0, 1)}
        maximumDate={new Date(new Date().getFullYear() - 12, 11, 31)}
        invalid={!birthOk}
      />
      {!birthOk && <Text style={styles.error}>Elige una fecha válida (entre 12 y 100 años).</Text>}

      <Text style={styles.label}>Altura en cm (opcional)</Text>
      <TextInput
        value={draft.heightText}
        onChangeText={(heightText) => update({ heightText })}
        placeholder="175"
        placeholderTextColor={colors.textMuted}
        style={[styles.input, !heightOk && styles.inputError]}
        keyboardType="decimal-pad"
        maxLength={5}
      />
      {!heightOk && <Text style={styles.error}>Entre 100 y 250 cm.</Text>}
      <Text style={styles.hint}>Sirven para calcular tus índices en Cuerpo. Puedes agregarlos en Mi perfil.</Text>
    </View>
  );
}

// ---------- 3. Nivel ----------

const LEVELS: { id: Level; title: string; description: string }[] = [
  { id: 'beginner', title: 'Principiante', description: 'Entreno poco o nunca he usado kettlebell.' },
  {
    id: 'intermediate',
    title: 'Intermedio',
    description: 'Entreno regularmente y conozco el swing y la sentadilla goblet.',
  },
  { id: 'advanced', title: 'Avanzado', description: 'Domino la técnica de kettlebell y entreno hace más de un año.' },
];

export function LevelStep({ draft, update }: StepProps) {
  return (
    <View style={styles.gap}>
      {LEVELS.map((l) => (
        <OptionCard
          key={l.id}
          title={l.title}
          description={l.description}
          selected={draft.level === l.id}
          onPress={() => update({ level: l.id })}
        />
      ))}
    </View>
  );
}

// ---------- 4. Equipamiento ----------

export function EquipmentStep({ draft, update }: StepProps) {
  return (
    <View style={styles.gap}>
      {/* La kettlebell es el corazón de la app: va primero. */}
      <Text style={styles.label}>¿Qué kettlebell tienes? (kg)</Text>
      <Text style={styles.hint}>Con una basta. Marca todas las que tengas: la rutina solo usará esos pesos.</Text>
      <View style={styles.weights}>
        {KB_WEIGHTS.map((kg) => {
          const on = draft.kettlebellWeightsKg.includes(kg);
          return (
            <Pressable
              key={kg}
              onPress={() =>
                update({ kettlebellWeightsKg: toggle(draft.kettlebellWeightsKg, kg).sort((a, b) => a - b) })
              }
              style={[styles.weight, on && styles.weightOn]}
            >
              <Text style={[styles.weightText, on && { color: '#fff' }]}>{kg}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, { marginTop: spacing.md }]}>Lo básico</Text>
      {BASE_EQUIPMENT.filter((id) => id !== 'kettlebell').map((id) => (
        <OptionCard key={id} title={EQUIPMENT[id]} selected locked />
      ))}
      <Text style={styles.label}>Opcional: ¿qué más tienes?</Text>
      {OPTIONAL_EQUIPMENT.map((id) => (
        <OptionCard
          key={id}
          title={EQUIPMENT[id]}
          selected={draft.equipment.includes(id)}
          onPress={() => update({ equipment: toggle(draft.equipment, id) })}
        />
      ))}

      <Text style={[styles.label, { marginTop: spacing.md }]}>Si entrenas en un parque, ¿qué hay ahí?</Text>
      <Text style={styles.hint}>
        Al parque llevas tu colchoneta, kettlebell, mancuernas y banda. La silla y la barra de tu casa no: marca si tu
        parque tiene algo parecido.
      </Text>
      {PARK_EQUIPMENT_IDS.map((id) => (
        <OptionCard
          key={id}
          title={PARK_EQUIPMENT[id]!}
          selected={draft.parkEquipment.includes(id)}
          onPress={() => update({ parkEquipment: toggle(draft.parkEquipment, id) })}
        />
      ))}
    </View>
  );
}

// ---------- 5. Condiciones médicas ----------

export function ConditionsStep({ draft, update }: StepProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const setCondition = (conditionId: string, activeFlags: RestrictionFlagId[] | null) => {
    const others = draft.conditions.filter((c) => c.conditionId !== conditionId);
    update({ conditions: activeFlags ? [...others, { conditionId, activeFlags, notes: null }] : others });
  };

  return (
    <View style={styles.gap}>
      <Text style={styles.hint}>
        Marca las que tengas. Te sugerimos qué evitar, pero tú decides: desmarca lo que sí puedas hacer.
      </Text>
      {MEDICAL_CONDITIONS.map((c) => {
        const current = draft.conditions.find((x) => x.conditionId === c.id);
        const flagsToShow = expanded === c.id ? RESTRICTION_FLAG_IDS : c.suggestedFlags;
        return (
          <OptionCard
            key={c.id}
            title={c.name}
            selected={!!current}
            onPress={() => setCondition(c.id, current ? null : c.suggestedFlags)}
          >
            {current && (
              <View style={styles.flags}>
                <Text style={styles.flagsTitle}>Evitar:</Text>
                {flagsToShow.map((f) => (
                  <CheckRow
                    key={f}
                    label={RESTRICTION_FLAGS[f]}
                    checked={current.activeFlags.includes(f)}
                    onPress={() => setCondition(c.id, toggle(current.activeFlags, f))}
                  />
                ))}
                <Pressable onPress={() => setExpanded(expanded === c.id ? null : c.id)}>
                  <Text style={styles.link}>
                    {expanded === c.id ? 'Ver solo las sugeridas' : 'Ver todas las restricciones'}
                  </Text>
                </Pressable>
              </View>
            )}
          </OptionCard>
        );
      })}
      {draft.conditions.length === 0 && <Text style={styles.hint}>Si no tienes ninguna, sigue adelante.</Text>}
    </View>
  );
}

// ---------- 6. Tu semana ----------

export function WeekStep({ draft, update }: StepProps) {
  const hasConditions = draft.conditions.length > 0;
  const [mode, setMode] = useState<'manual' | 'auto'>(draft.isNew ? 'auto' : 'manual');
  const training = DAYS.filter((d) => draft.weekChoices[d.id].length > 0).length;
  const [daysPerWeek, setDaysPerWeek] = useState(Math.max(1, training || 3));

  const propose = (n: number) => {
    setDaysPerWeek(n);
    const { choices, gentle } = proposeWeek(n, hasConditions);
    update({ weekChoices: choices, gentleDays: gentle });
  };
  const setDay = (day: DayOfWeek, parts: DayChoice) =>
    update({
      weekChoices: { ...draft.weekChoices, [day]: parts },
      gentleDays: canBeGentle(parts) ? draft.gentleDays : draft.gentleDays.filter((g) => g !== day),
    });
  const toggleGentle = (day: DayOfWeek) =>
    update({
      gentleDays: draft.gentleDays.includes(day)
        ? draft.gentleDays.filter((g) => g !== day)
        : [...draft.gentleDays, day],
    });

  return (
    <View style={styles.gap}>
      {draft.isNew && (
        <View style={styles.aiBox}>
          <Text style={styles.aiTitle}>✨ La IA creará tu semana</Text>
          <Text style={styles.body}>
            Aquí eliges qué hacer cada día. Luego la IA arma tus rutinas según tu perfil, lesiones, equipamiento y
            tiempo. Puede tardar hasta un minuto.
          </Text>
        </View>
      )}
      <View style={styles.segment}>
        {(
          [
            ['manual', 'Elijo yo'],
            ['auto', 'Propónmelo tú'],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => {
              setMode(id);
              if (id === 'auto') propose(daysPerWeek);
            }}
            style={[styles.segBtn, mode === id && styles.segOn]}
          >
            <Text style={[styles.segText, mode === id && { color: '#fff' }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'auto' && (
        <View style={styles.autoBox}>
          <Text style={styles.label}>¿Cuántos días quieres entrenar?</Text>
          <View style={styles.weights}>
            {[2, 3, 4, 5, 6].map((n) => (
              <Pressable
                key={n}
                onPress={() => propose(n)}
                style={[styles.weight, daysPerWeek === n && styles.weightOn]}
              >
                <Text style={[styles.weightText, daysPerWeek === n && { color: '#fff' }]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            {hasConditions
              ? 'Con 4 días o más alternamos días de fuerza con días para tu lesión. Puedes cambiar cualquier día abajo.'
              : 'Repartimos los días de fuerza con descanso entre medio. Puedes cambiar cualquier día abajo.'}
          </Text>
        </View>
      )}

      {DAYS.map((d) => {
        const parts = draft.weekChoices[d.id];
        const rest = parts.length === 0;
        return (
          <View key={d.id} style={styles.dayRow}>
            <Text style={styles.dayName} numberOfLines={1}>
              {d.long}
            </Text>
            <View style={styles.dayTypes}>
              {DAY_PARTS.map((p) => {
                const on = parts.includes(p);
                return (
                  <Pressable
                    key={p}
                    onPress={() => setDay(d.id, toggleDayPart(parts, p))}
                    style={[styles.typeChip, on && styles.typeChipOn]}
                  >
                    <Text style={[styles.typeChipText, on && { color: '#fff' }]} numberOfLines={1}>
                      {dayPartLabel(p, hasConditions)}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => setDay(d.id, [])} style={[styles.typeChip, rest && styles.typeChipRest]}>
                <Text style={[styles.typeChipText, rest && { color: colors.text }]} numberOfLines={1}>
                  Descanso
                </Text>
              </Pressable>
            </View>
            {hasConditions && canBeGentle(parts) && (
              <Pressable onPress={() => toggleGentle(d.id)} style={styles.stepRow} hitSlop={6}>
                <Text style={styles.stepLabel} numberOfLines={1}>
                  Fuerza suave (día de lesión)
                </Text>
                <Ionicons
                  name={draft.gentleDays.includes(d.id) ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={draft.gentleDays.includes(d.id) ? colors.accent : colors.textMuted}
                />
              </Pressable>
            )}
            {!rest && (
              <View style={styles.stepRow}>
                <Text style={styles.stepLabel} numberOfLines={1}>
                  Tiempo disponible
                </Text>
                <Stepper
                  value={draft.weekMinutes[d.id]}
                  min={10}
                  max={120}
                  step={5}
                  suffix="'"
                  onChange={(m) => update({ weekMinutes: { ...draft.weekMinutes, [d.id]: m } })}
                />
              </View>
            )}
          </View>
        );
      })}

      {mode === 'manual' && (
        <View style={styles.dayRow}>
          <Text style={styles.dayName}>Ejercicios por parte</Text>
          {DAY_PARTS.map((p) => (
            <View key={p} style={styles.stepRow}>
              <Text style={styles.stepLabel} numberOfLines={1}>
                {dayPartLabel(p, hasConditions)}
              </Text>
              <Stepper
                value={draft.partCounts[p]}
                min={1}
                max={PART_MAX[p]}
                onChange={(n) => update({ partCounts: { ...draft.partCounts, [p]: n } })}
              />
            </View>
          ))}
          <Text style={styles.hint}>Es una base: la rutina la ajusta a los minutos de cada día.</Text>
        </View>
      )}

      <Text style={styles.hint}>
        Marca una o varias partes por día.
        {hasConditions ? ' «Lesión» son los ejercicios para cuidar tu condición.' : ''} Después puedes afinar cada día
        (grupos musculares, casa o parque) en «Mi semana».
      </Text>
    </View>
  );
}

// ---------- 7. Resumen ----------

const SUMMARY_BLOCKS: BlockType[] = ['warmup', 'prehab', 'main_strength', 'cooldown'];

export function SummaryStep({ draft }: StepProps) {
  const profile = { equipment: draft.equipment, conditions: draft.conditions, excludedExerciseIds: [] };
  const avoided = [...new Set(draft.conditions.flatMap((c) => c.activeFlags))];

  return (
    <View style={styles.gap}>
      <SummaryRow
        label="Sobre ti"
        value={
          [
            draft.sex === 'female' ? 'Mujer' : draft.sex === 'male' ? 'Hombre' : null,
            draft.birthText || null,
            draft.heightText ? `${draft.heightText} cm` : null,
          ]
            .filter(Boolean)
            .join(' · ') || '—'
        }
      />
      <SummaryRow
        label="Tu semana"
        value={DAYS.map(
          (d) => `${d.short}: ${dayChoiceLabel(draft.weekChoices[d.id], draft.conditions.length > 0).toLowerCase()}${draft.gentleDays.includes(d.id) ? ' (fuerza suave)' : ''}`,
        ).join('\n')}
      />
      <SummaryRow label="Nivel" value={LEVELS.find((l) => l.id === draft.level)?.title ?? '—'} />
      <SummaryRow label="Equipamiento" value={draft.equipment.map((e) => EQUIPMENT[e]).join(', ')} />
      <SummaryRow
        label="En el parque"
        value={draft.parkEquipment.map((e) => PARK_EQUIPMENT[e]).join(', ') || 'Solo lo que llevas'}
      />
      <SummaryRow label="Kettlebells" value={draft.kettlebellWeightsKg.map((k) => `${k} kg`).join(', ')} />
      <SummaryRow
        label="Condiciones"
        value={
          draft.conditions.map((c) => MEDICAL_CONDITIONS.find((m) => m.id === c.conditionId)?.name).join(', ') ||
          'Ninguna'
        }
      />
      {avoided.length > 0 && (
        <SummaryRow label="Evitaremos" value={avoided.map((f) => RESTRICTION_FLAGS[f]).join(', ')} />
      )}

      <View style={styles.available}>
        <Text style={styles.flagsTitle}>Ejercicios disponibles para ti</Text>
        {SUMMARY_BLOCKS.map((b) => (
          <View key={b} style={styles.availableRow}>
            <Text style={styles.body}>{BLOCK_LABELS[b]}</Text>
            <Text style={styles.availableCount}>
              {filterExercisesForUser(EXERCISES, profile, b).length} /{' '}
              {EXERCISES.filter((e) => e.blockTypes.includes(b)).length}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.body}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  aiBox: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  aiTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  intro: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, gap: spacing.md },
  introContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  introLogo: { width: 260, height: 260 },
  introBrand: { color: colors.accent, fontSize: 24, letterSpacing: 1.5 },
  introHeadline: { color: colors.text, fontSize: 46, lineHeight: 50, textAlign: 'center' },
  introBody: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 340,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  displayFallback: { fontWeight: '800' },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.pill, alignItems: 'center' },
  segOn: { backgroundColor: colors.accent },
  segText: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  autoBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  dayRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  dayName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  dayTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  stepLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  typeChipRest: { backgroundColor: colors.surfaceAlt, borderColor: colors.surfaceAlt },
  typeChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  gap: { gap: spacing.md },
  label: { color: colors.text, fontSize: 15, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    padding: spacing.lg,
  },
  inputError: { borderColor: colors.warning },
  error: { color: colors.warning, fontSize: 13 },
  row2: { flexDirection: 'row', gap: spacing.md },
  disclaimer: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  disclaimerTitle: { color: colors.warning, fontWeight: '800' },
  weights: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  weight: {
    width: 58,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  weightOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  weightText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  flags: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  flagsTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  link: { color: colors.accent, fontWeight: '600', marginTop: spacing.sm },
  summaryRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  summaryLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  available: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  availableRow: { flexDirection: 'row', justifyContent: 'space-between' },
  availableCount: { color: colors.accent, fontWeight: '800', fontSize: 15 },
});
