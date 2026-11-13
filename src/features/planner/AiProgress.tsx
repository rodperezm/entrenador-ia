import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/theme';

// Mientras la IA arma la semana (hasta un minuto y medio) se muestra que sigue trabajando.
// La IA no informa su avance: la barra y los textos van por tiempo, para acompañar la espera.
const EXPECTED_SEC = 85;
const STEPS = [
  { from: 0, text: 'Revisando lo que registraste…' },
  { from: 15, text: 'Eligiendo tus ejercicios…' },
  { from: 40, text: 'Ajustando series, pesos y descansos…' },
  { from: 65, text: 'Revisando que todo sea seguro para ti…' },
];

// Se monta solo mientras la IA trabaja: así el reloj parte de cero en cada consulta.
export const AiProgress = ({ active }: { active: boolean }) => (active ? <Running /> : null);

function Running() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Nunca llega al final sola: se completa cuando la semana está lista y este aviso desaparece.
  const progress = Math.min(0.95, seconds / EXPECTED_SEC);
  const step = [...STEPS].reverse().find((s) => seconds >= s.from) ?? STEPS[0];

  return (
    <View
      style={styles.box}
      accessibilityRole="progressbar"
      accessibilityLabel={step.text}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(4, progress * 100)}%` }]} />
      </View>
      <Text style={styles.step}>{step.text}</Text>
      <Text style={styles.note}>Puede tardar hasta un minuto y medio. No cierres la app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs, marginTop: spacing.xs },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  step: { color: colors.text, fontSize: 14, fontWeight: '700' },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
});
