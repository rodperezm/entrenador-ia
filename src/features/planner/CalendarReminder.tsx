import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Button, Stepper } from '@/components/ui';
import { buildCalendar } from '@/domain/calendar';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

// Recordatorios sin servidor: la persona agrega sus días al calendario del teléfono, y el
// calendario le avisa. La hora elegida se recuerda en este teléfono.
const TIME_KEY = 'reminder-time.v1';
const BEFORE_OPTIONS = [
  { min: 0, label: 'A la hora' },
  { min: 15, label: '15 min antes' },
  { min: 60, label: '1 hora antes' },
];
type Saved = { hour: number; minute: number; before: number };
const DEFAULT: Saved = { hour: 19, minute: 0, before: 15 };

const isApple = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

// En iPhone, abrir el archivo muestra la hoja «Añadir al calendario»; en el resto se descarga.
function openCalendar(ics: string) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  if (!isApple()) link.download = 'kettai-entrenamientos.ics';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

export function CalendarReminder() {
  const { profile } = useProfile();
  const { week } = usePlan();
  const [time, setTime] = useState<Saved>(DEFAULT);
  const [done, setDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TIME_KEY)
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
        if (saved && Number.isInteger(saved.hour) && Number.isInteger(saved.minute) && Number.isInteger(saved.before)) {
          setTime({ hour: saved.hour!, minute: saved.minute!, before: saved.before! });
        }
      })
      .catch(() => {});
  }, []);

  // Por ahora solo en la versión web, que es la que está publicada.
  if (Platform.OS !== 'web' || !profile) return null;
  const days = week.days.filter((d) => d.active).length;
  if (!days) return null;

  // Sobre el valor más reciente: dos cambios seguidos no deben pisarse entre sí.
  const change = (patch: Partial<Saved>) => {
    setTime((previous) => {
      const next = { ...previous, ...patch };
      AsyncStorage.setItem(TIME_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    setDone(false);
  };

  const add = () => {
    const ics = buildCalendar(week, {
      hour: time.hour,
      minute: time.minute,
      remindBeforeMin: time.before,
      hasConditions: profile.conditions.length > 0,
      appUrl: Linking.createURL('/'),
    });
    if (!ics) return;
    openCalendar(ics);
    setDone(true);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="notifications-outline" size={18} color={colors.accent} />
        <Text style={styles.title}>Recordatorios</Text>
      </View>
      <Text style={styles.detail}>
        Agrega tus {days} {days === 1 ? 'día' : 'días'} de entrenamiento a tu calendario y deja que el teléfono te avise.
      </Text>

      <Text style={styles.label}>¿A qué hora entrenas?</Text>
      <View style={styles.row}>
        <Stepper value={time.hour} min={5} max={23} onChange={(hour) => change({ hour })} suffix=" h" />
        <View style={styles.chips}>
          {[0, 30].map((minute) => (
            <Chip
              key={minute}
              label={`:${String(minute).padStart(2, '0')}`}
              active={time.minute === minute}
              onPress={() => change({ minute })}
            />
          ))}
        </View>
      </View>

      <Text style={styles.label}>¿Cuándo te avisamos?</Text>
      <View style={styles.chips}>
        {BEFORE_OPTIONS.map((o) => (
          <Chip key={o.min} label={o.label} active={time.before === o.min} onPress={() => change({ before: o.min })} />
        ))}
      </View>

      <Button label="Agregar mis días al calendario" variant="secondary" onPress={add} />
      <Text style={styles.note}>
        {done
          ? 'Listo. Si se descargó un archivo, ábrelo y elige «Añadir» para que queden en tu calendario.'
          : 'Si después cambias tus días o la hora, vuelve a agregarlos: se actualizan los mismos eventos.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  detail: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
});
