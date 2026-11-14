import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AI_CASES } from '@/aiCases/cases';
import { type AiRequest, caseRequest, type RawPlan, type Review, reviewAiPlan } from '@/aiCases/review';
import { Button } from '@/components/ui';
import { AiPlanError, requestAiPlan } from '@/features/planner/aiPlan';
import { colors, display, radius, spacing } from '@/theme';

// Pantalla de trabajo, solo en modo desarrollo: le envía a la IA real los casos fijos y le pone
// nota a cada respuesta. Se corre antes y después de cambiar las instrucciones, el modelo o lo que
// se le manda, para saber si el cambio la mejoró o la empeoró. Cada caso gasta una consulta de la
// cuenta con la que se entró.

type Result = { review: Review; model: string | null } | { error: string };
type Recorded = { caseId: string; model: string | null; date: string; request: AiRequest; plan: RawPlan };

export default function AiCasesScreen() {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  // /ai-cases?solo=rodilla,principiante corre solo esos casos (para repetir los que no respondieron).
  const { solo } = useLocalSearchParams<{ solo?: string }>();
  const only = solo ? solo.split(',') : null;
  const cases = only ? AI_CASES.filter((c) => only.includes(c.id)) : AI_CASES;

  if (!__DEV__) return <Redirect href="/" />;

  const run = async () => {
    const saved: Recorded[] = [];
    setResults({});
    for (const c of cases) {
      setRunning(c.id);
      const now = Date.now();
      const { request, history } = caseRequest(c, now);
      try {
        const data = await requestAiPlan(request);
        const plan = (data.plan ?? {}) as RawPlan;
        const review = reviewAiPlan(c, request, plan, history);
        saved.push({ caseId: c.id, model: data.model ?? null, date: new Date(now).toISOString(), request, plan });
        setResults((r) => ({ ...r, [c.id]: { review, model: data.model ?? null } }));
      } catch (e) {
        setResults((r) => ({ ...r, [c.id]: { error: e instanceof AiPlanError ? e.message : 'error inesperado' } }));
      }
    }
    setRecorded(saved);
    setRunning(null);
  };

  // Para dejarlas en tests/ia-grabadas: desde ahí las revisan las pruebas automáticas.
  const download = () => {
    if (Platform.OS !== 'web') return;
    const blob = new Blob([JSON.stringify(recorded, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const scores = Object.values(results).flatMap((r) => ('review' in r ? [r.review.score] : []));
  const average = scores.length ? Math.round((10 * scores.reduce((a, b) => a + b, 0)) / scores.length) / 10 : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Casos fijos de la IA</Text>
      <Text style={styles.body}>
        {AI_CASES.length} personas inventadas, siempre las mismas. Cada caso gasta una consulta de IA de esta cuenta.
      </Text>
      <Button
        label={running ? 'Consultando a la IA…' : `Correr ${cases.length === AI_CASES.length ? 'los ' : 'solo '}${cases.length} casos`}
        onPress={run}
        disabled={!!running}
      />
      {average != null && !running ? (
        <Text style={styles.average} testID="ai-average">
          Nota promedio: {average} de 10 ({scores.length} de {cases.length} casos respondidos)
        </Text>
      ) : null}
      {recorded.length > 0 && !running ? (
        <Button label="Descargar las respuestas" variant="secondary" onPress={download} />
      ) : null}
      {AI_CASES.map((c) => {
        const r = results[c.id];
        return (
          <View key={c.id} style={styles.card} testID={`ai-case-${c.id}`}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.why}>{c.why}</Text>
            {running === c.id ? <Text style={styles.why}>Consultando…</Text> : null}
            {r && 'error' in r ? <Text style={styles.grave}>No respondió: {r.error}</Text> : null}
            {r && 'review' in r ? (
              <>
                <Text style={styles.score}>
                  Nota {r.review.score} de 10 · {r.model ?? 'modelo desconocido'}
                </Text>
                {r.review.findings.length === 0 ? <Text style={styles.why}>Sin observaciones.</Text> : null}
                {r.review.findings.map((f, i) => (
                  <Text key={i} style={f.level === 'grave' ? styles.grave : styles.why}>
                    {f.level === 'grave' ? 'Grave' : 'Aviso'}
                    {f.day ? ` · ${f.day}` : ''}: {f.text}
                  </Text>
                ))}
              </>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...display(24), color: colors.text },
  body: { color: colors.textMuted, fontSize: 15 },
  average: { color: colors.text, fontSize: 17, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  why: { color: colors.textMuted, fontSize: 14 },
  score: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: spacing.xs },
  grave: { color: colors.bad, fontSize: 14 },
});
