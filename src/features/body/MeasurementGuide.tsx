import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { Silhouette } from '@/components/BodyMap';
import { ageAt, fatCuts, todayISO } from '@/domain/body';
import type { Sex } from '@/domain/schema';
import { colors, radius, spacing } from '@/theme';

// Guía de medición (cinta y caliper), basada en la de MetricBody.

export type GuideTab = 'tape' | 'folds';

const GREEN = '#2EBD6B';
const YELLOW = '#F5B700';
const RED = '#E5484D';
const BLUE = '#6FA6D6';

const num = (n: number, d = 2) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d });

// ---------- Contenido ----------

const TAPE_TIPS: ReactNode[] = [
  'Mide siempre a la misma hora, idealmente en la mañana, en ayunas y después de ir al baño.',
  'Usa una cinta métrica flexible, sin apretar la piel. Debe quedar paralela al suelo.',
  'Mantente de pie, relajado, y toma la medida al final de una exhalación normal, sin contraer el abdomen.',
  'Pésate en la misma balanza y con poca ropa. Basta con un registro por semana para ver la tendencia.',
];

const TAPE_SITES = [
  {
    n: 1,
    title: 'Tórax',
    text: 'A la altura de las tetillas, pasando bajo las axilas y por la parte más ancha de la espalda.',
    y: 100,
    x1: 54,
    x2: 146,
  },
  {
    n: 2,
    title: 'Cintura',
    text: 'La parte más estrecha del torso, entre la última costilla y la cadera.',
    y: 148,
    x1: 60,
    x2: 140,
  },
  {
    n: 3,
    title: 'Abdomen',
    text: 'A la altura del ombligo, tal como lo mide habitualmente el médico, con la cinta horizontal alrededor del torso.',
    y: 172,
    x1: 63,
    x2: 137,
  },
  { n: 4, title: 'Cadera', text: 'La parte más ancha de los glúteos, con los pies juntos.', y: 208, x1: 62, x2: 138 },
];

const FOLD_TIPS: ReactNode[] = [
  <>
    Mide siempre en el <B>lado derecho</B> del cuerpo, de pie, erguido y relajado. Es el protocolo internacional.
  </>,
  'Toma el pliegue con el pulgar y el índice, sepáralo del músculo y pon el caliper a 1 cm de los dedos. Lee el valor a los 2 segundos.',
  <>
    Anota los pliegues en <B>milímetros</B> (lo que marca la escala del caliper), nunca en centímetros.
  </>,
  'Repite cada pliegue 2 o 3 veces. La app promedia las tomas para reducir el error de pinza.',
  'Mide en las mismas condiciones cada vez: misma hora, piel seca y antes de hacer ejercicio.',
];

// Puntos en la silueta (vista frontal: el lado derecho de la persona queda a la izquierda).
const FOLD_SITES: Record<Sex, { n: number; title: string; text: string; x: number; y: number }[]> = {
  male: [
    {
      n: 1,
      title: 'Pecho (pectoral)',
      text: 'Pliegue diagonal, a mitad de camino entre el pezón y la parte frontal de la axila, sobre la línea imaginaria que los une.',
      x: 74,
      y: 92,
    },
    { n: 2, title: 'Abdomen', text: 'Pliegue vertical, 2 cm a la derecha del ombligo.', x: 86, y: 176 },
    {
      n: 3,
      title: 'Muslo',
      text: 'Pliegue vertical en el centro del muslo, a mitad de camino entre la ingle y la parte superior de la rótula.',
      x: 82,
      y: 280,
    },
  ],
  female: [
    {
      n: 1,
      title: 'Tríceps',
      text: 'Pliegue vertical en la parte posterior del brazo, sobre el tríceps, a mitad de camino entre el hombro y el codo.',
      x: 49,
      y: 125,
    },
    {
      n: 2,
      title: 'Suprailíaco',
      text: 'Pliegue diagonal, justo por encima de la parte frontal y más adelantada del hueso de la cadera.',
      x: 70,
      y: 190,
    },
    {
      n: 3,
      title: 'Muslo',
      text: 'Pliegue vertical en el centro del muslo, a mitad de camino entre la ingle y la parte superior de la rótula.',
      x: 82,
      y: 280,
    },
  ],
};

const REFERENCE = [
  ['Tórax', '100–108 cm', '88–94 cm'],
  ['Cintura', '80–86 cm', '64–70 cm'],
  ['Abdomen', '82–88 cm', '68–76 cm'],
  ['Cadera', '95–100 cm', '92–98 cm'],
];

const AGE_LABELS = ['Hasta 20', '21–25', '26–30', '31–35', '36–40', '41–45', '46–50', '51–55', '56 o más'];
const AGE_FOR_ROW = [20, 25, 30, 35, 40, 45, 50, 55, 60];

// ---------- Componente ----------

export function MeasurementGuide({
  initialTab = 'tape',
  sex,
  birthDate,
}: {
  initialTab?: GuideTab;
  sex: Sex | null;
  birthDate: string | null;
}) {
  const [tab, setTab] = useState<GuideTab>(initialTab);
  const [fatSex, setFatSex] = useState<Sex>(sex ?? 'male');
  const myAge = ageAt(birthDate, todayISO());
  const sexOrder: Sex[] = sex === 'female' ? ['female', 'male'] : ['male', 'female'];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>GUÍA</Text>
      <Text style={styles.title}>Cómo medir</Text>
      <Text style={styles.lead}>Dónde medir y cómo leer cada resultado.</Text>

      <View style={styles.segment}>
        {(
          [
            ['tape', 'Cinta métrica'],
            ['folds', 'Caliper · pliegues'],
          ] as const
        ).map(([id, label]) => (
          <Pressable key={id} onPress={() => setTab(id)} style={[styles.segBtn, tab === id && styles.segOn]}>
            <Text style={[styles.segText, tab === id && { color: colors.text }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'tape' ? (
        <>
          <Section title="Antes de empezar">
            {TAPE_TIPS.map((t, i) => (
              <Bullet key={i}>{t}</Bullet>
            ))}
          </Section>

          <Section title="Dónde medir">
            <Figure caption="Vista frontal">
              <Circle cx={100} cy={176} r={1.8} fill={colors.textMuted} />
              {TAPE_SITES.map((s) => (
                <G key={s.n}>
                  <Line
                    x1={s.x1}
                    y1={s.y}
                    x2={s.x2}
                    y2={s.y}
                    stroke={colors.accent}
                    strokeWidth={2.2}
                    strokeDasharray="5 4"
                  />
                  <Badge x={s.x2 + 16} y={s.y} n={s.n} />
                </G>
              ))}
            </Figure>
            {TAPE_SITES.map((s) => (
              <Step key={s.n} n={s.n} title={s.title} text={s.text} />
            ))}
          </Section>

          <Section title="Qué significa cada índice">
            <IndexCard
              title="IMC · Índice de masa corporal"
              formula={<Fraction top="peso (kg)" bottom="altura (m)²" />}
              text="Relaciona tu peso con tu estatura. Es una referencia rápida, aunque no distingue músculo de grasa. Para eso está el % de grasa."
              bands={[['Bajo 25', '25 a 30', 'Sobre 30']]}
            />
            <IndexCard
              title="ICC · Índice cintura-cadera"
              formula={<Fraction top="cintura (cm)" bottom="cadera (cm)" />}
              text="Indica dónde se acumula la grasa. Más grasa en la cintura que en la cadera se asocia a mayor riesgo cardiovascular."
              bands={sexOrder.map((s) =>
                s === 'male'
                  ? (['Bajo 0,90', '0,90 a 0,95', 'Desde 0,95', 'Hombres'] as const)
                  : (['Bajo 0,80', '0,80 a 0,85', 'Desde 0,85', 'Mujeres'] as const),
              )}
            />
            <IndexCard
              title="ICE · Índice cintura-estatura"
              formula={<Fraction top="cintura (cm)" bottom="altura (cm)" />}
              text="La cintura debería medir menos de la mitad de tu altura. Funciona igual aunque tengas mucha masa muscular."
              bands={[['Bajo 0,50', '0,50 a 0,60', 'Desde 0,60']]}
            />
            <IndexCard
              title="Abdomen − cintura"
              formula={<Text style={styles.formula}>abdomen (cm) − cintura (cm)</Text>}
              text="Con poca grasa corporal, ambas medidas difieren apenas 2 a 5 cm. Si la diferencia crece, suele indicar más grasa abdominal."
              bands={[['Hasta 5 cm', '5 a 10 cm', 'Sobre 10 cm']]}
            />
          </Section>

          <Section title="Medidas de referencia">
            <Text style={styles.muted}>
              Valores habituales en contexturas medias o atléticas. Sirven para orientarte, no como meta.
            </Text>
            <View style={styles.table}>
              <Row cells={['Zona', 'Hombre', 'Mujer']} head />
              {REFERENCE.map((r) => (
                <Row key={r[0]} cells={r} />
              ))}
            </View>
          </Section>

          <Text style={styles.footer}>
            Estas referencias son orientativas y no reemplazan una evaluación profesional.
          </Text>
        </>
      ) : (
        <>
          <Section title="Antes de empezar">
            {FOLD_TIPS.map((t, i) => (
              <Bullet key={i}>{t}</Bullet>
            ))}
          </Section>

          {sexOrder.map((s) => (
            <Section key={s} title={`Dónde medir · ${s === 'male' ? 'Hombres' : 'Mujeres'}`}>
              <Figure caption="Lado derecho de la persona">
                {s === 'male' && <Circle cx={100} cy={176} r={1.8} fill={colors.textMuted} />}
                {FOLD_SITES[s].map((p) => (
                  <Badge key={p.n} x={p.x} y={p.y} n={p.n} />
                ))}
              </Figure>
              {FOLD_SITES[s].map((p) => (
                <Step key={p.n} n={p.n} title={p.title} text={p.text} />
              ))}
            </Section>
          ))}

          <Section title="Cómo se calcula">
            <Text style={styles.muted}>
              La app usa el método de Jackson y Pollock de 3 pliegues, uno de los más validados en antropometría y
              nutrición deportiva. El cálculo tiene tres pasos.
            </Text>
            <Step
              n={1}
              title="Suma de pliegues (S)"
              text="Suma los milímetros de los tres pliegues: pecho + abdomen + muslo en hombres; tríceps + suprailíaco + muslo en mujeres."
            />
            <Step
              n={2}
              title="Densidad corporal (DC)"
              text="Se calcula con la suma y la edad en años, con una fórmula distinta para cada sexo."
            >
              <Text style={styles.label}>HOMBRES</Text>
              <Text style={[styles.formula, styles.formulaBox]}>
                DC = 1,10938 − 0,0008267·S + 0,0000016·S² − 0,0002574·Edad
              </Text>
              <Text style={styles.label}>MUJERES</Text>
              <Text style={[styles.formula, styles.formulaBox]}>
                DC = 1,0994921 − 0,0009929·S + 0,0000023·S² − 0,0001392·Edad
              </Text>
            </Step>
            <Step
              n={3}
              title="% de grasa (ecuación de Siri)"
              text="Convierte la densidad en porcentaje de grasa. Es igual para ambos sexos."
            >
              <View style={[styles.formulaBox, styles.formulaRow]}>
                <Text style={styles.formula}>% grasa = (</Text>
                <Fraction top="4,95" bottom="DC" bare />
                <Text style={styles.formula}>− 4,50 ) × 100</Text>
              </View>
            </Step>
          </Section>

          <Section title="Semáforo de % grasa">
            <Text style={styles.muted}>
              El rango saludable sube con la edad. Las categorías vienen de las tablas de grasa corporal por pliegues
              para cada sexo y grupo de edad.{myAge != null ? ' Tu fila aparece destacada.' : ''}
            </Text>
            <View style={styles.legend}>
              {(
                [
                  ['Delgado', BLUE],
                  ['Ideal', GREEN],
                  ['Promedio', YELLOW],
                  ['Sobrepeso', RED],
                ] as const
              ).map(([label, c]) => (
                <View key={label} style={[styles.legendItem, { borderTopColor: c }]}>
                  <Text style={[styles.legendText, { color: c }]} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.segmentSmall}>
              {(['male', 'female'] as const).map((s) => (
                <Pressable key={s} onPress={() => setFatSex(s)} style={[styles.segBtn, fatSex === s && styles.segOn]}>
                  <Text style={[styles.segText, fatSex === s && { color: colors.text }]}>
                    {s === 'male' ? 'Hombres' : 'Mujeres'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.table}>
              <Row cells={['Edad', 'Delgado', 'Ideal', 'Promedio', 'Sobrepeso']} head small />
              {AGE_LABELS.map((label, i) => {
                const [a, b, c] = fatCuts(fatSex, AGE_FOR_ROW[i]);
                const mine =
                  fatSex === sex && myAge != null && fatCuts(fatSex, myAge)[0] === a && fatCuts(fatSex, myAge)[1] === b;
                return (
                  <Row
                    key={label}
                    small
                    highlight={mine}
                    cells={[
                      label,
                      `<${num(a, 1)}`,
                      `${num(a, 1)}–${num(b, 1)}`,
                      `${num(b, 1)}–${num(c, 1)}`,
                      `≥${num(c, 1)}`,
                    ]}
                  />
                );
              })}
            </View>
          </Section>

          <Text style={styles.footer}>
            El caliper estima la grasa subcutánea; su precisión depende de la técnica. Úsalo para ver tu tendencia en el
            tiempo, siempre con la misma persona midiendo si es posible. No reemplaza una evaluación profesional.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

// ---------- Piezas ----------

function B({ children }: { children: ReactNode }) {
  return <Text style={{ fontWeight: '800', color: colors.text }}>{children}</Text>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.underline} />
      </View>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.dot} />
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

function Figure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <View style={styles.figure}>
      <Svg width={170} height={357} viewBox="0 0 200 420">
        <Silhouette />
        {children}
      </Svg>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

function Badge({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={13} fill={colors.accent} stroke={colors.bg} strokeWidth={2.5} />
      <SvgText x={x} y={y + 5.5} fontSize={15} fontWeight="800" fill="#fff" textAnchor="middle">
        {String(n)}
      </SvgText>
    </G>
  );
}

function Step({ n, title, text, children }: { n: number; title: string; text: string; children?: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.body}>{text}</Text>
        {children}
      </View>
    </View>
  );
}

function Fraction({ top, bottom, bare }: { top: string; bottom: string; bare?: boolean }) {
  return (
    <View style={[styles.fraction, !bare && styles.formulaBox]}>
      <Text style={styles.formula}>{top}</Text>
      <View style={styles.fracLine} />
      <Text style={styles.formula}>{bottom}</Text>
    </View>
  );
}

type Band = readonly [string, string, string] | readonly [string, string, string, string];

function IndexCard({
  title,
  formula,
  text,
  bands,
}: {
  title: string;
  formula: ReactNode;
  text: string;
  bands: Band[];
}) {
  return (
    <View style={[styles.card, { flexDirection: 'column' }]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={{ alignSelf: 'flex-start' }}>{formula}</View>
      <Text style={styles.body}>{text}</Text>
      {bands.map((band, i) => (
        <View key={i} style={{ gap: 4 }}>
          {band[3] && <Text style={styles.label}>{band[3].toUpperCase()}</Text>}
          <View style={styles.band}>
            {[GREEN, YELLOW, RED].map((c, j) => (
              <View key={c} style={[styles.bandCell, { borderTopColor: c, backgroundColor: `${c}22` }]}>
                <Text style={[styles.bandText, { color: c }]} numberOfLines={1} adjustsFontSizeToFit>
                  {band[j]}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function Row({
  cells,
  head,
  small,
  highlight,
}: {
  cells: string[];
  head?: boolean;
  small?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.row, highlight && styles.rowOn]}>
      {cells.map((c, i) => (
        <Text
          key={i}
          numberOfLines={1}
          style={[
            head ? styles.th : styles.td,
            small && { fontSize: head ? 10 : 12 },
            { flex: i === 0 ? (small ? 1.05 : 1.2) : 1, textAlign: i === 0 ? 'left' : 'center' },
            highlight && { color: colors.text, fontWeight: '800' },
          ]}
        >
          {c}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  eyebrow: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  lead: { color: colors.textMuted, fontSize: 15 },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 4,
    marginTop: spacing.sm,
  },
  segmentSmall: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  segOn: { backgroundColor: colors.surfaceAlt },
  segText: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  section: { gap: spacing.md, marginTop: spacing.md },
  sectionHead: { alignSelf: 'flex-start', gap: 6 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  underline: { height: 2, backgroundColor: colors.accent, borderRadius: 1 },
  bullet: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text, marginTop: 9 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22, flex: 1 },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  figure: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  caption: { color: colors.textMuted, fontSize: 13 },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: '#fff', fontWeight: '800' },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  formula: { color: colors.accent, fontSize: 14, fontVariant: ['tabular-nums'], lineHeight: 20 },
  formulaBox: { backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  formulaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  fraction: { alignItems: 'center', gap: 3 },
  fracLine: { alignSelf: 'stretch', height: 1.5, backgroundColor: colors.accent },
  band: { flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden' },
  bandCell: { flex: 1, borderTopWidth: 3, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center' },
  bandText: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden' },
  legendItem: { flex: 1, borderTopWidth: 3, backgroundColor: colors.surface, paddingVertical: 8, alignItems: 'center' },
  legendText: { fontSize: 12, fontWeight: '800' },
  table: { borderTopWidth: 1, borderTopColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowOn: { backgroundColor: `${GREEN}22` },
  th: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  td: { color: colors.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  footer: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.lg },
});
