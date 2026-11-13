import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/theme';

// BORRADOR, igual que los Términos (content/terms): debe revisarlo un abogado antes de lanzar o cobrar.
// Forma parte de los Términos y condiciones.
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
    title: 'Videos de ejercicios',
    body: 'Los videos se reproducen desde YouTube. Al abrir un ejercicio, YouTube recibe datos técnicos de tu conexión, como tu dirección IP. No le enviamos tu perfil ni tus datos de salud.',
  },
  {
    title: 'Medición del registro',
    body: 'Mientras creas tu perfil, anotamos hasta qué paso llegó tu teléfono, para saber dónde se complica el registro. Es anónimo: un identificador al azar, el paso y la fecha. No incluye tu correo ni ningún dato tuyo.',
  },
  {
    title: 'Errores y comentarios',
    body: 'Si la app falla, nos llega un aviso automático con el error, la pantalla donde ocurrió, la versión de la app y el tipo de teléfono, para poder corregirlo. También nos llega lo que escribas en «Enviar un comentario». Ninguno de los dos incluye tus entrenamientos ni tus datos de salud.',
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
    body: 'KETTAI no reemplaza a un médico, kinesiólogo u otro profesional de la salud.',
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
