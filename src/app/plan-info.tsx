import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { dayPartLabel } from '@/domain/week';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

const WEEKS = [
  { title: 'Semana 1: Introductoria (Adaptación)', body: 'Tomas el ritmo y ajustas tus pesos.' },
  { title: 'Semana 2: Base (Aumento gradual)', body: 'Sumas trabajo manteniendo la técnica.' },
  { title: 'Semana 3: Máxima Intensidad', body: 'Es la semana más exigente del ciclo.' },
  { title: 'Semana 4: Descarga (Recuperación)', body: 'Bajas el volumen para recuperarte.' },
];
const BEGINNER_PEAK = 'Si estás empezando, la intensidad está en la técnica: usas el mismo peso, con más control.';

const BLOCKS = [
  {
    letter: 'A',
    title: 'Potencia',
    body: 'Movimientos explosivos o técnica de bisagra, con pocas repeticiones de calidad.',
  },
  { letter: 'B', title: 'Fuerza', body: 'Empuje, tirón y sentadilla con control: baja en 3 s y sube rápido.' },
  { letter: 'C', title: 'Remate', body: 'Un cierre opcional de acarreo o core, si te queda tiempo y energía.' },
];

export default function PlanInfoScreen() {
  const { profile } = useProfile();
  const beginner = profile?.level === 'beginner';
  const care = dayPartLabel('prehab', (profile?.conditions.length ?? 0) > 0);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        Entrenas todo el cuerpo por patrones de movimiento. Las lesiones, el dolor y tu equipamiento siempre mandan.
      </Text>

      <Text style={styles.section}>Cómo se arma cada día</Text>
      <View style={styles.row}>
        <Text style={styles.rowTitle}>Fuerza</Text>
        <Text style={styles.body}>
          Siempre con Calentamiento y Elongación. Puedes sumar {care}. Necesita al menos 20 minutos.
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowTitle}>{care}</Text>
        <Text style={styles.body}>Siempre con un calentamiento suave. Puedes sumar Elongación.</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowTitle}>Elongación</Text>
        <Text style={styles.body}>Puede ir sola: estira lento y sin forzar.</Text>
      </View>

      <Text style={styles.section}>Tu ciclo de 4 semanas</Text>
      {WEEKS.map((w) => (
        <View key={w.title} style={styles.row}>
          <Text style={styles.rowTitle}>{w.title}</Text>
          <Text style={styles.body}>{beginner && w.title.includes('Máxima') ? BEGINNER_PEAK : w.body}</Text>
        </View>
      ))}
      <Text style={styles.body}>
        Repites los ejercicios de Fuerza durante el ciclo para medir tu progreso. Cambian antes solo si hay dolor o no
        tienes el equipamiento. La semana 1 puede traer más ejercicios porque tiene menos series.
      </Text>
      <Text style={styles.body}>
        Avanzas de semana cuando la cumples: con al menos la mitad de tus días de fuerza entrenados. Si una semana no
        alcanzas, la repites, así nunca llegas a la más exigente sin haber hecho la anterior.
      </Text>

      <Text style={styles.section}>Cada semana</Text>
      <Text style={styles.body}>
        Al empezar la semana, la app te avisa para armarla. Así tu rutina se ajusta con lo que registraste: avanzas si
        te fue bien y mantienes el peso si quedó muy pesado o marcaste molestias. Con dolor fuerte, el ejercicio se
        cambia.
      </Text>

      <Text style={styles.section}>Tu sesión de Fuerza</Text>
      {BLOCKS.map((b) => (
        <View key={b.letter} style={styles.row}>
          <Text style={styles.rowTitle}>
            {b.letter} · {b.title}
          </Text>
          <Text style={styles.body}>{b.body}</Text>
        </View>
      ))}

      <Text style={styles.section}>Cuando termina un ciclo</Text>
      <Text style={styles.body}>
        Mantenemos tus patrones y cambiamos ejercicios para darle un nuevo estímulo a tu cuerpo. Subes un peldaño con
        más peso, una variante más difícil, más tensión o menos descanso.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  lead: { color: colors.text, fontSize: 16, lineHeight: 23 },
  section: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: spacing.md },
  row: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});
