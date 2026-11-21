import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { BodyMap } from '@/components/BodyMap';
import { Button } from '@/components/ui';
import { AFTER_WARMUP_OPTIONS, ARRIVAL_OPTIONS, ZONES } from '@/domain/checkIn';
import type { BodyZone, CheckIn } from '@/domain/schema';
import { type Choice, ChoiceTiles } from '@/features/workout/ChoiceTiles';
import { colors, display, spacing } from '@/theme';

// Íconos de cada respuesta, en la misma línea que «¿Cómo estuvo hoy?» al terminar.
const ARRIVAL_ICON: Record<CheckIn['arrival'], Choice<string>['icon']> = {
  energized: 'flash-outline',
  normal: 'thumbs-up-outline',
  tired: 'battery-half-outline',
  pain: 'bandage-outline',
};
const AFTER_WARMUP_ICON: Record<NonNullable<CheckIn['afterWarmup']>, Choice<string>['icon']> = {
  activated: 'flash-outline',
  tired: 'battery-half-outline',
  very_tired: 'battery-dead-outline',
};

// «¿Dónde te duele?»: cada zona con la figura del cuerpo, del lado en que mejor se ve.
const ZONE_VIEW: Record<BodyZone, 'front' | 'back'> = {
  shoulder: 'front',
  elbow_wrist: 'front',
  neck: 'back',
  low_back: 'back',
  hip: 'front',
  knee: 'front',
  ankle_foot: 'back',
};

const PAIN_LEVELS: Choice<1 | 2 | 3>[] = [
  { id: 1, label: 'Leve', description: 'Se nota, pero no limita', tone: 'warning' },
  { id: 2, label: 'Moderado', description: 'Molesta al moverme', tone: 'warning' },
  { id: 3, label: 'Fuerte', description: 'Me limita o duele mucho', tone: 'warning' },
];

// Al empezar: cómo llega la persona. Con dolor, pregunta dónde y cuánto.
export function ArrivalQuestion({ onAnswer, insetTop }: { onAnswer: (c: CheckIn) => void; insetTop: number }) {
  const [zone, setZone] = useState<BodyZone | null>(null);
  const [askingPain, setAskingPain] = useState(false);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insetTop + 40 }]}>
      {!askingPain ? (
        <>
          <Text style={styles.title}>¿Cómo llegas hoy?</Text>
          <Text style={styles.hero}>Tu sesión se ajusta a cómo llegas</Text>
          <ChoiceTiles
            options={ARRIVAL_OPTIONS.map((o) => ({
              ...o,
              icon: ARRIVAL_ICON[o.id],
              tone: o.id === 'pain' ? ('warning' as const) : undefined,
            }))}
            onPick={(id) => (id === 'pain' ? setAskingPain(true) : onAnswer({ arrival: id }))}
          />
        </>
      ) : !zone ? (
        <>
          <Text style={styles.title}>¿Dónde te duele?</Text>
          <Text style={styles.hero}>Hoy cuidamos esa zona</Text>
          <ChoiceTiles
            options={ZONES.map((z) => ({
              id: z.id,
              label: z.label,
              visual: (
                <BodyMap
                  primary={z.muscles.map((muscle) => ({ muscle, intensity: 1 }))}
                  views={[ZONE_VIEW[z.id]]}
                  height={84}
                />
              ),
            }))}
            onPick={setZone}
          />
          <Button label="Volver" variant="ghost" onPress={() => setAskingPain(false)} />
        </>
      ) : (
        <>
          <Text style={styles.title}>¿Cuánto te duele?</Text>
          <Text style={styles.hero}>{ZONES.find((z) => z.id === zone)!.label}</Text>
          <ChoiceTiles
            options={PAIN_LEVELS}
            scale={['Menos', 'Más']}
            onPick={(level) => onAnswer({ arrival: 'pain', painZone: zone, painLevel: level })}
          />
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
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insetTop + 40 }]}>
      <Text style={styles.title}>¿Cómo te sientes ahora?</Text>
      <Text style={styles.hero}>Ya calentaste: muchas veces el cuerpo responde al empezar</Text>
      <ChoiceTiles
        options={AFTER_WARMUP_OPTIONS.map((o) => ({ ...o, icon: AFTER_WARMUP_ICON[o.id] }))}
        scale={['Con energía', 'Sin energía']}
        onPick={onAnswer}
      />
    </ScrollView>
  );
}

// Mensaje corto según la respuesta, para mostrar al seguir.
// El mensaje depende de lo que tiene el día: sin calentamiento no se promete volver a preguntar
// después de él, y un día solo de elongación no cambia por el cansancio.
export function checkInMessage(c: CheckIn, day: { warmup: boolean; strength: boolean }): string | null {
  if (c.afterWarmup === 'activated') return 'Tu cuerpo respondió. ¡Vamos!';
  if (c.afterWarmup === 'tired') return 'Hoy una serie menos. Deja 2 o 3 repeticiones en reserva.';
  if (c.afterWarmup === 'very_tired') return 'Hoy técnica y movimiento, con peso cómodo. Cuenta igual.';
  if (c.arrival === 'tired') {
    if (!day.strength) return 'Elongar con cansancio hace bien. Hazlo a tu ritmo, sin forzar.';
    if (!day.warmup)
      return 'Empieza suave y mira cómo responde tu cuerpo. Si sigues cansado, deja 2 o 3 repeticiones en reserva.';
    return 'Hagamos el calentamiento y vemos cómo te sientes.';
  }
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
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 48 },
  title: { color: colors.text, ...display(38), textAlign: 'center' },
  hero: { color: colors.accent, fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: -spacing.sm },
});
