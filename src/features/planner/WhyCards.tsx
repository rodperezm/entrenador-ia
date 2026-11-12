import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WeekExplanation } from '@/domain/explain';
import { colors, radius, spacing } from '@/theme';

// Las explicaciones de la semana y del día: el porqué de lo que propone la app, con datos reales.

const TAG_LABEL = { anchor: '  · Ancla del ciclo', new: '  · Nuevo', back: '  · Vuelve esta semana', none: '' };

export function WhyWeek({ explanation, aiNote }: { explanation: WeekExplanation; aiNote: string | null }) {
  const [open, setOpen] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const { title, purpose, why, changes, works } = explanation;
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>¿Por qué esta semana?</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{purpose}</Text>
      {/* A la vista queda el propósito de la semana; el detalle se abre al tocar. */}
      {open &&
        [...why, ...works].map((l, i) => (
          <Text key={i} style={styles.bullet}>
            • {l}
          </Text>
        ))}
      {why.length + works.length > 0 && (
        <Pressable onPress={() => setOpen(!open)} hitSlop={8}>
          <Text style={styles.link}>{open ? 'Ver menos' : 'Ver por qué y qué trabajas'}</Text>
        </Pressable>
      )}
      {open && changes.length > 0 && (
        <>
          <Pressable onPress={() => setShowChanges(!showChanges)} hitSlop={8}>
            <Text style={styles.link}>
              {showChanges
                ? 'Ocultar los cambios'
                : `Ver tus anclas, lo nuevo y qué cambia en Fuerza (${changes.length})`}
            </Text>
          </Pressable>
          {showChanges &&
            changes.map((c) => (
              <View key={c.name} style={styles.change}>
                <Text style={styles.changeName}>
                  {c.name}
                  {TAG_LABEL[c.tag ?? 'none']}
                </Text>
                <Text style={styles.changeDose}>
                  {c.before
                    ? c.before === c.now
                      ? `${c.now} · igual que la última vez`
                      : `${c.before} → ${c.now}`
                    : `${c.now} · primera vez`}
                </Text>
                {c.sinceStart && (
                  <Text style={styles.muted}>
                    Al empezar el ciclo: {c.sinceStart} · ahora: {c.now}
                  </Text>
                )}
                {c.note && <Text style={styles.muted}>{c.note}</Text>}
              </View>
            ))}
        </>
      )}
      {aiNote && <Text style={styles.ai}>✨ {aiNote}</Text>}
    </View>
  );
}

const DAY_LINES_SHOWN = 2;

export function WhyDay({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  if (!lines.length) return null;
  const more = lines.length - DAY_LINES_SHOWN;
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>¿Por qué esta sesión?</Text>
      {(open ? lines : lines.slice(0, DAY_LINES_SHOWN)).map((l, i) => (
        <Text key={i} style={styles.bullet}>
          • {l}
        </Text>
      ))}
      {more > 0 && (
        <Pressable onPress={() => setOpen(!open)} hitSlop={8}>
          <Text style={styles.link}>{open ? 'Ver menos' : `Ver más (${more})`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  bullet: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  link: { color: colors.link, fontSize: 14, fontWeight: '700', marginTop: spacing.xs },
  change: {
    gap: 2,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  changeName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  changeDose: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  ai: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: spacing.xs },
});
