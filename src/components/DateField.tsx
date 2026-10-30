import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { type ChangeEvent, createElement, type MouseEvent, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';

// Campo de fecha con calendario nativo (iOS: calendario en un recuadro;
// Android: diálogo del sistema; web: calendario del navegador).
// Trabaja con fechas ISO "AAAA-MM-DD".

const toDate = (iso: string) =>
  new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const display = (iso: string) => iso.split('-').reverse().join('-');

// Calendario del navegador, invisible sobre el campo: se ve igual que en la app nativa.
const WEB_DATE_INPUT = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  border: 0,
  cursor: 'pointer',
  fontSize: 16,
} as const;

type Props = {
  value: string | null;
  onChange: (iso: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Fecha que muestra el calendario si aún no hay valor. */
  initialDate?: Date;
  invalid?: boolean;
};

export function DateField({
  value,
  onChange,
  placeholder = 'Elegir fecha',
  minimumDate,
  maximumDate,
  initialDate,
  invalid,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => (value ? toDate(value) : (initialDate ?? new Date())));

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.field, styles.row, invalid && styles.invalid]}>
        <Text style={[styles.fieldText, !value && { color: colors.textMuted }]}>
          {value ? display(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
        {createElement('input', {
          type: 'date',
          'aria-label': placeholder,
          value: value ?? '',
          min: minimumDate && toIso(minimumDate),
          max: maximumDate && toIso(maximumDate),
          onChange: (e: ChangeEvent<HTMLInputElement>) => {
            if (e.target.value) onChange(e.target.value);
          },
          // En computador hay que pedirlo: al tocar el campo solo se abre en teléfonos.
          onClick: (e: MouseEvent<HTMLInputElement>) => e.currentTarget.showPicker?.(),
          style: WEB_DATE_INPUT,
        })}
      </View>
    );
  }

  const openPicker = () => {
    const start = value ? toDate(value) : (initialDate ?? new Date());
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        minimumDate,
        maximumDate,
        onValueChange: (_e, d) => onChange(toIso(d)),
      });
      return;
    }
    setDraft(start);
    setOpen(true);
  };

  return (
    <>
      <Pressable onPress={openPicker} style={[styles.field, styles.row, invalid && styles.invalid]}>
        <Text style={[styles.fieldText, !value && { color: colors.textMuted }]}>
          {value ? display(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <DateTimePicker
              value={draft}
              mode="date"
              display="inline"
              themeVariant="dark"
              accentColor={colors.accent}
              locale="es-CL"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onValueChange={(_e, d) => setDraft(d)}
            />
            <View style={styles.actions}>
              <Pressable onPress={() => setOpen(false)} style={styles.cancel}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onChange(toIso(draft));
                  setOpen(false);
                }}
                style={styles.ok}
              >
                <Text style={styles.okText}>Listo</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  fieldText: { color: colors.text, fontSize: 16 },
  invalid: { borderColor: colors.warning },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  cancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  cancelText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  ok: { flex: 1, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center' },
  okText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
