import { BebasNeue_400Regular, useFonts } from '@expo-google-fonts/bebas-neue';
import { router } from 'expo-router';
import { Fragment, useState } from 'react';
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
  canBeGentle,
  DAY_KIND_PARTS,
  type DayChoice,
  type DayKind,
  dayKindOf,
  type DayPart,
  dayChoiceLabel,
  DAYS,
  EXTRA_MINUTES,
  maxStrengthDays,
  MIN_STRENGTH_DAYS,
  STRENGTH_DAY,
  STRENGTH_MINUTES,
  strengthDaysFrom,
  strengthLimitNote,
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
  kettlebellPairsKg: number[];
  dumbbellWeightsKg: number[];
  dumbbellPairsKg: number[];
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
const DB_WEIGHTS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20];

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

// ---------- Portada (antes del paso 1, solo la primera vez) ----------

export function IntroScreen({ onStart, onExisting }: { onStart: () => void; onExisting?: () => void }) {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  const display = fontsLoaded ? { fontFamily: 'BebasNeue_400Regular' } : styles.displayFallback;

  return (
    <View style={[styles.intro, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
      <ScrollView contentContainerStyle={styles.introContent}>
        <Image
          source={require('../../../assets/icon.png')}
          style={styles.introLogo}
          accessibilityLabel="Logo de KETTAI"
        />
        <Text style={[styles.introBrand, display]}>KETTAI</Text>
        <Text style={[styles.introHeadline, display]}>Entrena fuerte.{'\n'}Cuida lo que duele.</Text>
        <Text style={styles.introBody}>
          La fuerza es la clave para moverte con libertad toda la vida: solo necesitas una kettlebell, tu cuerpo y un
          plan que respete tus lesiones.
        </Text>
      </ScrollView>
      <Button label="Empezar" onPress={onStart} />
      {CLOUD_BACKUP_READY && (
        <Button
          label="Ya tengo cuenta"
          variant="ghost"
          onPress={onExisting ?? (() => router.push({ pathname: '/account', params: { mode: 'existing' } }))}
        />
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

      {/* Primera vez: lo opcional queda para Mi perfil y el nivel va aquí para ahorrar un paso. */}
      {draft.isNew ? (
        <>
          <Text style={[styles.label, { marginTop: spacing.md }]}>Tu nivel</Text>
          <LevelStep draft={draft} update={update} />
        </>
      ) : (
        <>
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
          <Text style={styles.hint}>Sirven para calcular tus índices en Cuerpo.</Text>
        </>
      )}
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
  const [showMore, setShowMore] = useState(!draft.isNew);
  return (
    <View style={styles.gap}>
      {/* La kettlebell es el corazón de la app: va primero. */}
      <Text style={styles.label}>¿Qué kettlebell tienes? (kg)</Text>
      <Text style={styles.hint}>Con una basta. Marca todas las que tengas: la rutina solo usará esos pesos.</Text>
      <OwnedWeights
        options={KB_WEIGHTS}
        weights={draft.kettlebellWeightsKg}
        pairs={draft.kettlebellPairsKg}
        pairHint="Con dos del mismo peso sumamos ejercicios como el paseo del granjero."
        onChange={(kettlebellWeightsKg, kettlebellPairsKg) => update({ kettlebellWeightsKg, kettlebellPairsKg })}
      />

      {!showMore && (
        <Pressable onPress={() => setShowMore(true)} style={styles.moreLink}>
          <Text style={styles.link}>Tengo más equipamiento (opcional)</Text>
        </Pressable>
      )}
      {showMore && (
        <>
          <Text style={[styles.label, { marginTop: spacing.md }]}>Lo básico</Text>
          {BASE_EQUIPMENT.filter((id) => id !== 'kettlebell').map((id) => (
            <OptionCard key={id} title={EQUIPMENT[id]} selected locked />
          ))}
          <Text style={styles.label}>Opcional: ¿qué más tienes?</Text>
          {OPTIONAL_EQUIPMENT.map((id) => (
            <Fragment key={id}>
              <OptionCard
                title={EQUIPMENT[id]}
                selected={draft.equipment.includes(id)}
                onPress={() => update({ equipment: toggle(draft.equipment, id) })}
              />
              {id === 'bench' && (
                <Text style={styles.hint}>
                  La silla sirve para sentarte o apoyar las manos. Para subirte, saltar o apoyar la espalda con peso
                  hace falta algo que no se mueva: una banca firme o un escalón.
                </Text>
              )}
              {id === 'dumbbells' && draft.equipment.includes('dumbbells') && (
                <View style={styles.nested}>
                  <Text style={styles.label}>¿De qué peso son tus mancuernas? (kg)</Text>
                  <Text style={styles.hint}>Si son livianas para tu nivel, en su lugar usamos la kettlebell.</Text>
                  <OwnedWeights
                    options={DB_WEIGHTS}
                    weights={draft.dumbbellWeightsKg}
                    pairs={draft.dumbbellPairsKg}
                    pairHint="La mayoría de los ejercicios con mancuernas usan una en cada mano."
                    onChange={(dumbbellWeightsKg, dumbbellPairsKg) => update({ dumbbellWeightsKg, dumbbellPairsKg })}
                  />
                </View>
              )}
            </Fragment>
          ))}

          <Text style={[styles.label, { marginTop: spacing.md }]}>Si entrenas en un parque, ¿qué hay ahí?</Text>
          <Text style={styles.hint}>
            Al parque llevas tu colchoneta, kettlebell, mancuernas, banda y barra de activación. La silla, la banca y la
            barra de dominadas de tu casa no: marca si tu parque tiene algo parecido.
          </Text>
          {PARK_EQUIPMENT_IDS.map((id) => (
            <OptionCard
              key={id}
              title={PARK_EQUIPMENT[id]!}
              selected={draft.parkEquipment.includes(id)}
              onPress={() => update({ parkEquipment: toggle(draft.parkEquipment, id) })}
            />
          ))}
        </>
      )}
    </View>
  );
}

// Pesos que tiene y de cuáles tiene dos (kettlebells o mancuernas).
function OwnedWeights({
  options,
  weights,
  pairs,
  pairHint,
  onChange,
}: {
  options: number[];
  weights: number[];
  pairs: number[];
  pairHint: string;
  onChange: (weights: number[], pairs: number[]) => void;
}) {
  return (
    <>
      <View style={styles.weights}>
        {options.map((kg) => {
          const on = weights.includes(kg);
          return (
            <Pressable
              key={kg}
              onPress={() =>
                onChange(
                  toggle(weights, kg).sort((a, b) => a - b),
                  pairs.filter((w) => w !== kg),
                )
              }
              style={[styles.weight, on && styles.weightOn]}
            >
              <Text style={[styles.weightText, on && { color: colors.onAccent }]}>{kg}</Text>
            </Pressable>
          );
        })}
      </View>

      {weights.length > 0 && (
        <>
          <Text style={[styles.label, { marginTop: spacing.md }]}>¿De cuál tienes dos? (opcional)</Text>
          <Text style={styles.hint}>{pairHint}</Text>
          <View style={styles.weights}>
            {weights.map((kg) => {
              const on = pairs.includes(kg);
              return (
                <Pressable
                  key={kg}
                  onPress={() =>
                    onChange(
                      weights,
                      toggle(pairs, kg).sort((a, b) => a - b),
                    )
                  }
                  style={[styles.weight, on && styles.weightOn]}
                  accessibilityLabel={`Tengo dos de ${kg} kilos`}
                >
                  <Text style={[styles.weightText, on && { color: colors.onAccent }]}>2 × {kg}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </>
  );
}

// ---------- 5. Condiciones médicas ----------

export function ConditionsStep({ draft, update }: StepProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const protectsKnees = draft.conditions.some((c) => c.activeFlags.includes('deep_knee_flexion_loaded'));

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
      {protectsKnees && (
        <>
          <Text style={styles.hint}>
            Como evitamos sentadillas profundas, una silla firme nos permite incluir sentadilla a la silla, y una banca
            o escalón, la subida al cajón, para mantener fuertes tus piernas.
          </Text>
          <OptionCard
            title="Tengo una silla firme"
            selected={draft.equipment.includes('chair')}
            onPress={() => update({ equipment: toggle(draft.equipment, 'chair') })}
          />
          <OptionCard
            title="Tengo una banca firme o un escalón"
            selected={draft.equipment.includes('bench')}
            onPress={() => update({ equipment: toggle(draft.equipment, 'bench') })}
          />
        </>
      )}
    </View>
  );
}

// ---------- 6. Tu semana ----------

const clampTo = (value: number, range: { min: number; max: number }) => Math.min(range.max, Math.max(range.min, value));

// La persona dice cuántos días de Fuerza quiere, cuánto tiempo tiene y qué día parte; la app
// reparte los días con sus descansos. Después puede sumar días de lesión (o movilidad) y de
// elongación en los días libres. La Lesión nunca va el mismo día que la Fuerza.
export function WeekStep({ draft, update }: StepProps) {
  const hasConditions = draft.conditions.length > 0;
  const maxDays = maxStrengthDays(draft.level);
  const mondayStart = new Date().getDay() === 1;
  const kindOf = (day: DayOfWeek) => dayKindOf(draft.weekChoices[day]);
  const strengthDays = DAYS.filter((d) => kindOf(d.id) === 'strength').map((d) => d.id);
  const extraDays = DAYS.filter((d) => ['care', 'stretch'].includes(kindOf(d.id))).map((d) => d.id);
  const count = strengthDays.length;
  const today = DAYS[(new Date().getDay() + 6) % 7].id;
  const [startDay, setStartDay] = useState<DayOfWeek>(strengthDays[0] ?? today);
  const [note, setNote] = useState<string | null>(null);

  const strengthMinutes = clampTo(
    strengthDays.length ? draft.weekMinutes[strengthDays[0]] : STRENGTH_MINUTES.initial,
    STRENGTH_MINUTES,
  );
  const extraMinutes = clampTo(
    extraDays.length ? draft.weekMinutes[extraDays[0]] : EXTRA_MINUTES.initial,
    EXTRA_MINUTES,
  );

  // Guarda la semana con los minutos de cada tipo de día. Un día de fuerza suave deja de serlo
  // si ya no junta Lesión con Fuerza.
  const save = (choices: Draft['weekChoices'], minutes = { strength: strengthMinutes, extra: extraMinutes }) =>
    update({
      weekChoices: choices,
      weekMinutes: Object.fromEntries(
        DAYS.map((d) => {
          const kind = dayKindOf(choices[d.id]);
          const value =
            kind === 'strength' ? minutes.strength : kind === 'rest' ? draft.weekMinutes[d.id] : minutes.extra;
          return [d.id, value];
        }),
      ) as Draft['weekMinutes'],
      gentleDays: draft.gentleDays.filter((g) => canBeGentle(choices[g])),
    });

  // Reparte los días de Fuerza desde el día de inicio; lo sumado en los días que siguen libres se conserva.
  const propose = (n: number, start: DayOfWeek) => {
    setNote(null);
    setStartDay(start);
    const days = strengthDaysFrom(Math.min(n, maxDays), start);
    save(
      Object.fromEntries(
        DAYS.map((d) => [
          d.id,
          days.includes(d.id) ? STRENGTH_DAY : kindOf(d.id) === 'strength' ? [] : draft.weekChoices[d.id],
        ]),
      ) as Draft['weekChoices'],
    );
  };

  // Mover un día de Fuerza a mano: se quita uno y se pone otro, entre 2 y el máximo.
  const toggleStrength = (day: DayOfWeek) => {
    const on = kindOf(day) === 'strength';
    if (on && count <= MIN_STRENGTH_DAYS)
      return setNote('El mínimo son 2 días de Fuerza: con menos no alcanza para progresar.');
    if (!on && count >= maxDays) return setNote(strengthLimitNote(draft.level));
    setNote(null);
    save({ ...draft.weekChoices, [day]: on ? [] : STRENGTH_DAY });
  };

  const setExtra = (day: DayOfWeek, kind: DayKind) => save({ ...draft.weekChoices, [day]: DAY_KIND_PARTS[kind] });

  const freeDays = DAYS.filter((d) => kindOf(d.id) !== 'strength');
  const careLabel = hasConditions ? 'Lesión' : 'Movilidad';
  // `day`: botón de día de la semana; los 7 reparten el ancho para caber en una fila.
  const chip = (label: string, on: boolean, onPress: () => void, key?: string, day = false) => (
    <Pressable
      key={key ?? label}
      onPress={onPress}
      style={[styles.weight, day && styles.dayChip, on && styles.weightOn]}
    >
      <Text style={[styles.weightText, day && styles.dayChipText, on && { color: colors.onAccent }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.gap}>
      {draft.isNew && (
        <View style={styles.aiBox}>
          <Text style={styles.aiTitle}>{mondayStart ? '✨ La IA creará tu semana' : 'Partes con días de técnica'}</Text>
          <Text style={styles.body}>
            {mondayStart
              ? 'Con estos datos, la IA arma tus rutinas según tu perfil, lesiones, equipamiento y tiempo.'
              : 'La app arma tu preparación y, desde el lunes, la IA crea tu semana.'}
          </Text>
        </View>
      )}

      <View style={styles.autoBox}>
        <Text style={styles.label}>¿Cuántos días de Fuerza a la semana?</Text>
        <View style={styles.weights}>
          {Array.from({ length: maxDays - MIN_STRENGTH_DAYS + 1 }, (_, i) => i + MIN_STRENGTH_DAYS).map((n) =>
            chip(String(n), count === n, () => propose(n, startDay)),
          )}
        </View>
        <Text style={styles.hint}>
          {draft.level === 'beginner'
            ? 'Como principiante, tu máximo son 3 días: el cuerpo aprende los movimientos y necesita descanso. '
            : ''}
          {count >= 4
            ? 'Con 4 días o más, la Fuerza se divide en tren inferior y tren superior, para que cada zona descanse.'
            : 'Con 2 o 3 días, cada sesión trabaja el cuerpo completo.'}
        </Text>

        <View style={[styles.stepRow, { marginTop: spacing.md }]}>
          <Text style={styles.stepLabel}>Minutos por día de Fuerza</Text>
          <Stepper
            value={strengthMinutes}
            min={STRENGTH_MINUTES.min}
            max={STRENGTH_MINUTES.max}
            step={5}
            suffix="'"
            onChange={(m) => save(draft.weekChoices, { strength: m, extra: extraMinutes })}
          />
        </View>
        <Text style={styles.hint}>Incluye calentar y elongar: siempre van con la Fuerza.</Text>
      </View>

      <View style={styles.autoBox}>
        <Text style={styles.label}>¿Qué día partes?</Text>
        <View style={styles.dayChips}>
          {DAYS.map((d) =>
            chip(d.short, startDay === d.id, () => propose(Math.max(count, MIN_STRENGTH_DAYS), d.id), d.id, true),
          )}
        </View>
        <Text style={styles.hint}>Desde ese día repartimos tu Fuerza, con los descansos entre medio.</Text>

        <Text style={[styles.label, { marginTop: spacing.md }]}>Tus días de Fuerza</Text>
        <View style={styles.dayChips}>
          {DAYS.map((d) => chip(d.short, kindOf(d.id) === 'strength', () => toggleStrength(d.id), d.id, true))}
        </View>
        <Text style={styles.hint}>¿Algún día no te acomoda? Tócalo para quitarlo y toca otro para ponerlo.</Text>
        {note && <Text style={styles.restNote}>{note}</Text>}
      </View>

      <View style={styles.autoBox}>
        <Text style={styles.label}>
          {hasConditions
            ? '¿Quieres sumar días para tu lesión o para elongar?'
            : '¿Quieres sumar días de movilidad o elongación?'}
        </Text>
        <Text style={styles.hint}>
          Es opcional y va en los días sin Fuerza.{' '}
          {hasConditions
            ? 'Un día de Lesión lleva calentamiento, tus ejercicios de cuidado y elongación. En los días de Fuerza, el calentamiento ya activa esa zona.'
            : 'Un día de Movilidad lleva calentamiento, movilidad y elongación.'}
        </Text>
        {freeDays.map((d) => (
          <View key={d.id} style={styles.dayRow}>
            <Text style={styles.dayName} numberOfLines={1}>
              {d.long}
            </Text>
            <View style={styles.dayTypes}>
              {(
                [
                  ['rest', 'Descanso'],
                  ['care', careLabel],
                  ['stretch', 'Elongación'],
                ] as const
              ).map(([kind, label]) => {
                const on = kindOf(d.id) === kind;
                return (
                  <Pressable
                    key={kind}
                    onPress={() => setExtra(d.id, kind)}
                    style={[styles.typeChip, on && (kind === 'rest' ? styles.typeChipRest : styles.typeChipOn)]}
                  >
                    <Text
                      style={[styles.typeChipText, on && { color: kind === 'rest' ? colors.text : colors.onAccent }]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        {extraDays.length > 0 && (
          <View style={styles.stepRow}>
            <Text style={styles.stepLabel}>Minutos por día de apoyo</Text>
            <Stepper
              value={extraMinutes}
              min={EXTRA_MINUTES.min}
              max={EXTRA_MINUTES.max}
              step={5}
              suffix="'"
              onChange={(m) => save(draft.weekChoices, { strength: strengthMinutes, extra: m })}
            />
          </View>
        )}
      </View>

      <Text style={styles.hint}>
        Cuántos ejercicios lleva cada parte lo calcula la app con tus minutos y tu nivel, y te explica por qué. Después
        puedes afinar cada día (tiempo, casa o parque) en «Semana».
      </Text>
    </View>
  );
}

// ---------- 7. Resumen ----------

const SUMMARY_BLOCKS: BlockType[] = ['warmup', 'prehab', 'main_strength', 'cooldown'];

export function SummaryStep({ draft }: StepProps) {
  const profile = {
    equipment: draft.equipment,
    conditions: draft.conditions,
    excludedExerciseIds: [],
    level: draft.level ?? 'beginner',
    kettlebellWeightsKg: draft.kettlebellWeightsKg,
    kettlebellPairsKg: draft.kettlebellPairsKg,
    dumbbellWeightsKg: draft.dumbbellWeightsKg,
    dumbbellPairsKg: draft.dumbbellPairsKg,
  };
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
          (d) =>
            `${d.short}: ${dayChoiceLabel(draft.weekChoices[d.id], draft.conditions.length > 0).toLowerCase()}${draft.gentleDays.includes(d.id) ? ' (fuerza suave)' : ''}`,
        ).join('\n')}
      />
      <SummaryRow label="Nivel" value={LEVELS.find((l) => l.id === draft.level)?.title ?? '—'} />
      <SummaryRow label="Equipamiento" value={draft.equipment.map((e) => EQUIPMENT[e]).join(', ')} />
      <SummaryRow
        label="En el parque"
        value={draft.parkEquipment.map((e) => PARK_EQUIPMENT[e]).join(', ') || 'Solo lo que llevas'}
      />
      <SummaryRow
        label="Kettlebells"
        value={draft.kettlebellWeightsKg
          .map((k) => (draft.kettlebellPairsKg.includes(k) ? `2 × ${k} kg` : `${k} kg`))
          .join(', ')}
      />
      {draft.equipment.includes('dumbbells') && (
        <SummaryRow
          label="Mancuernas"
          value={
            draft.dumbbellWeightsKg
              .map((k) => (draft.dumbbellPairsKg.includes(k) ? `2 × ${k} kg` : `${k} kg`))
              .join(', ') || 'Sin peso indicado: no las usamos en Fuerza'
          }
        />
      )}
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
  nested: {
    gap: spacing.sm,
    marginLeft: spacing.md,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.accentSoft,
  },
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
  dayChips: { flexDirection: 'row', gap: 4 },
  dayChip: { flex: 1, width: undefined, minWidth: 0, paddingVertical: 10 },
  dayChipText: { fontSize: 13 },
  weightText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  flags: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  flagsTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  link: { color: colors.link, fontWeight: '600', marginTop: spacing.sm },
  restNote: { color: colors.warning, fontSize: 13, lineHeight: 18 },
  moreLink: { paddingVertical: spacing.sm },
  summaryRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  summaryLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  available: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  availableRow: { flexDirection: 'row', justifyContent: 'space-between' },
  availableCount: { color: colors.accent, fontWeight: '800', fontSize: 15 },
});
