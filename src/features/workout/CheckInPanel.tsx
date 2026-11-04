import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button, OptionCard } from '@/components/ui';
import { AFTER_WARMUP_OPTIONS, ARRIVAL_OPTIONS, ZONES } from '@/domain/checkIn';
import type { BodyZone, CheckIn } from '@/domain/schema';
import { colors, spacing } from '@/theme';

const PAIN_LEVELS: { level: 1 | 2 | 3; label: string; description: string }[] = [
  { level: 1, label: 'Leve', description: 'Se nota, pero no limita' },
  { level: 2, label: 'Moderado', description: 'Molesta al moverme' },
  { level: 3, label: 'Fuerte', description: 'Me limita o duele mucho' },
];

// Al empezar: cómo llega la persona. Con dolor, pregunta dónde y cuánto.
export function ArrivalQuestion({ onAnswer, insetTop }: { onAnswer: (c: CheckIn) => void; insetTop: number }) {
  const [zone, setZone] = useState<BodyZone | null>(null);
  const [askingPain, setAskingPain] = useState(false);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insetTop + 32 }]}>
      {!askingPain ? (
        <>
          <Text style={styles.title}>¿Cómo llegas hoy?</Text>
          {ARRIVAL_OPTIONS.map((o) => (
            <OptionCard
              key={o.id}
              title={o.label}
              selected={false}
              onPress={() => (o.id === 'pain' ? setAskingPain(true) : onAnswer({ arrival: o.id }))}
            />
          ))}
        </>
      ) : !zone ? (
        <>
          <Text style={styles.title}>¿Dónde te duele?</Text>
          {ZONES.map((z) => (
            <OptionCard key={z.id} title={z.label} selected={false} onPress={() => setZone(z.id)} />
          ))}
          <Button label="Volver" variant="ghost" onPress={() => setAskingPain(false)} />
        </>
      ) : (
        <>
          <Text style={styles.title}>¿Cuánto te duele?</Text>
          {PAIN_LEVELS.map((p) => (
            <OptionCard
              key={p.level}
              title={p.label}
              description={p.description}
              selected={false}
              onPress={() => onAnswer({ arrival: 'pain', painZone: zone, painLevel: p.level })}
            />
          ))}
          <Button label="Volver" variant="ghost" onPress={() => setZone(null)} />
        </>
      )}
    </ScrollView>
  );
}

// Si llegó cansado, se vuelve a preguntar después del calentamiento.
export function AfterWarmupQuestion({
  onAnswer,
  insetTop,
}: {
  onAnswer: (v: NonNullable<CheckIn['afterWarmup']>) => void;
  insetTop: number;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insetTop + 32 }]}>
      <Text style={styles.title}>¿Cómo te sientes ahora?</Text>
      <Text style={styles.body}>Ya calentaste. Muchas veces el cuerpo responde al empezar.</Text>
      {AFTER_WARMUP_OPTIONS.map((o) => (
        <OptionCard key={o.id} title={o.label} selected={false} onPress={() => onAnswer(o.id)} />
      ))}
    </ScrollView>
  );
}

// Mensaje corto según la respuesta, para mostrar al seguir.
export function checkInMessage(c: CheckIn): string | null {
  if (c.afterWarmup === 'activated') return 'Tu cuerpo respondió. ¡Vamos!';
  if (c.afterWarmup === 'tired') return 'Hoy una serie menos. Deja 2 o 3 repeticiones en reserva.';
  if (c.afterWarmup === 'very_tired') return 'Hoy técnica y movimiento, con peso cómodo. Cuenta igual.';
  if (c.arrival === 'tired') return 'Hagamos el calentamiento y vemos cómo te sientes.';
  if (c.arrival === 'pain' && c.painZone) {
    const zone = ZONES.find((z) => z.id === c.painZone)!.label.toLowerCase();
    if (c.painLevel === 3) return `Hoy no cargamos tu ${zone}. Si el dolor se repite, consulta a un profesional.`;
    if (c.painLevel === 2) return `Cambiamos los ejercicios que cargan tu ${zone}, solo por hoy.`;
    return `Molestia leve en ${zone}: si aumenta, márcala y lo cambiamos.`;
  }
  return null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', marginBottom: spacing.sm },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
});
