import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/theme';

// Texto de trabajo durante las pruebas: debe revisarlo un abogado antes de lanzar o cobrar.
const SECTIONS = [
  {
    title: 'Qué guardamos',
    body: 'En tu teléfono: tu perfil, lesiones, semana, rutinas, entrenamientos, esfuerzo, dolor y medidas corporales. Algunos de estos son datos de salud.',
  },
  {
    title: 'Respaldo en la nube',
    body: 'Es voluntario. Si lo activas, esos datos se guardan en Supabase, nuestro proveedor de base de datos, asociados a tu correo. Cada cuenta solo puede acceder a sus propios datos.',
  },
  {
    title: 'Inteligencia artificial',
    body: 'Cuando generas una semana con IA, tu nivel, edad, sexo, altura, equipamiento, lesiones, medidas e historial reciente se envían a Anthropic, nuestro proveedor de IA, para crear tu rutina. Esto ocurre tengas o no el respaldo activo.',
  },
  {
    title: 'Para qué los usamos',
    body: 'Solo para armar y ajustar tu entrenamiento y mantener tu historial. No vendemos tus datos.',
  },
  {
    title: 'Tu control',
    body: 'En Cuenta y respaldo puedes descargar tus datos, cerrar sesión o borrar tu cuenta y tu respaldo. Lo guardado en el teléfono se borra desde Mi perfil.',
  },
  {
    title: 'Importante',
    body: 'KettleIA no reemplaza a un médico, kinesiólogo u otro profesional de la salud.',
  },
];

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {SECTIONS.map((s) => (
        <View key={s.title} style={styles.section}>
          <Text style={styles.title}>{s.title}</Text>
          <Text style={styles.body}>{s.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 },
  section: { gap: spacing.xs },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
});
