import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export type Choice<T extends string | number> = {
  id: T;
  label: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  // En lugar del ícono, un dibujo (por ejemplo, la figura del cuerpo con la zona marcada).
  visual?: ReactNode;
  // «warning»: una opción que avisa algo (dolor); el ícono va en ámbar en vez del rojo de la marca.
  tone?: 'warning';
};

// Preguntas de la sesión como tarjetas (al llegar, tras calentar y al terminar): dos por fila, con
// ícono, y una escala debajo cuando las opciones van de menos a más.
export function ChoiceTiles<T extends string | number>({
  title,
  options,
  selected = null,
  onPick,
  scale,
  note,
}: {
  title?: string;
  options: Choice<T>[];
  selected?: T | null;
  onPick: (id: T) => void;
  scale?: [string, string];
  note?: string | null;
}) {
  return (
    <View style={styles.panel}>
      {title ? <Text style={styles.panelTitle}>{title}</Text> : null}
      <View style={styles.grid}>
        {options.map((o) => {
          const on = selected === o.id;
          const iconColor = on ? colors.onAccent : o.tone === 'warning' ? colors.warning : colors.accent;
          return (
            <Pressable
              accessibilityRole="button"
              aria-selected={on}
              key={String(o.id)}
              onPress={() => onPick(o.id)}
              style={[styles.tile, on && styles.tileOn]}
            >
              {o.visual ?? (o.icon ? <Ionicons name={o.icon} size={24} color={iconColor} /> : null)}
              <Text style={[styles.label, on && { color: colors.onAccent }]}>{o.label}</Text>
              {o.description ? (
                <Text style={[styles.description, on && { color: colors.onAccent }]}>{o.description}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {scale ? (
        <View style={styles.scale}>
          <Text style={styles.scaleText}>{scale[0]}</Text>
          <View style={styles.scaleLine} />
          <Text style={styles.scaleText}>{scale[1]}</Text>
        </View>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  panelTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48%',
    flexGrow: 1,
    minHeight: 76,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileOn: { backgroundColor: colors.accent },
  label: { color: colors.text, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  description: { color: colors.textMuted, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  scale: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scaleText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  scaleLine: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.border },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
});
