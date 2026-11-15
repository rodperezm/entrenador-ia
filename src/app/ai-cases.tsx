import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AI_CASES } from '@/aiCases/cases';
import { type AiRequest, caseRequest, type RawPlan, type Review, reviewAiPlan } from '@/aiCases/review';
import { Button } from '@/components/ui';
import { AiPlanError, requestAiPlan } from '@/features/planner/aiPlan';
import { colors, display, radius, spacing } from '@/theme';

// Pantalla de trabajo, solo en modo desarrollo: le envía a la IA real los casos fijos y revisa cada
// respuesta dos veces: tal como llegó de la IA y como queda la semana que recibe la persona, después
// de los ajustes de la app. Una semana final con una falta grave es una falla, sin importar la nota.
// Se corre a mano antes y después de cambiar las instrucciones, el modelo o lo que se le manda. Cada
// corrida de cada caso gasta una consulta de la cuenta con la que se entró.
//
//   /ai-cases                       cada caso una vez
//   /ai-cases?veces=3               cada caso tres veces (la IA no responde siempre igual)
//   /ai-cases?solo=rodilla,lumbar-recurrente   solo esos casos

type Run = { review: Review; model: string | null } | { error: string };
type Recorded = { caseId: string; model: string | null; date: string; request: AiRequest; plan: RawPlan };

const unique = (texts: string[]) => [...new Set(texts)];

export default function AiCasesScreen() {
  const [runs, setRuns] = useState<Record<string, Run[]>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  const { solo, veces } = useLocalSearchParams<{ solo?: string; veces?: string }>();
  const only = solo ? solo.split(',') : null;
  const cases = only ? AI_CASES.filter((c) => only.includes(c.id)) : AI_CASES;
  const times = Math.min(5, Math.max(1, Number(veces) || 1));

  if (!__DEV__) return <Redirect href="/" />;

  const run = async () => {
    const saved: Recorded[] = [];
    setRuns({});
    for (const c of cases) {
      for (let i = 1; i <= times; i++) {
        setRunning(`${c.id}:${i}`);
        const now = Date.now();
        const { request, history } = caseRequest(c, now);
        let result: Run;
        try {
          const data = await requestAiPlan(request);
          const plan = (data.plan ?? {}) as RawPlan;
          result = { review: reviewAiPlan(c, request, plan, history), model: data.model ?? null };
          saved.push({ caseId: c.id, model: data.model ?? null, date: new Date(now).toISOString(), request, plan });
        } catch (e) {
          result = { error: e instanceof AiPlanError ? e.message : 'error inesperado' };
        }
        setRuns((r) => ({ ...r, [c.id]: [...(r[c.id] ?? []), result] }));
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

  const answered = Object.values(runs).flat().flatMap((r) => ('review' in r ? [r.review] : []));
  const finalOk = answered.filter((r) => r.finalFindings.length === 0).length;
  const rawOk = answered.filter((r) => !r.findings.some((f) => f.level === 'grave')).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Casos fijos de la IA</Text>
      <Text style={styles.body}>
        {AI_CASES.length} personas inventadas, siempre las mismas. Cada corrida de cada caso gasta una consulta de IA de
        esta cuenta: {cases.length} {cases.length === 1 ? 'caso' : 'casos'} × {times} = {cases.length * times}{' '}
        consultas.
      </Text>
      <Button
        label={running ? 'Consultando a la IA…' : `Correr ${cases.length} casos × ${times}`}
        onPress={run}
        disabled={!!running}
      />
      {answered.length > 0 && !running ? (
        <Text style={styles.average} testID="ai-summary">
          Semana final sin faltas graves: {finalOk} de {answered.length}. Respuesta de la IA sin faltas graves: {rawOk} de{' '}
          {answered.length}.
        </Text>
      ) : null}
      {recorded.length > 0 && !running ? (
        <Button label="Descargar las respuestas" variant="secondary" onPress={download} />
      ) : null}
      {cases.map((c) => {
        const list = runs[c.id] ?? [];
        const ok = list.flatMap((r) => ('review' in r ? [r] : []));
        const errors = list.flatMap((r) => ('error' in r ? [r.error] : []));
        const rawGraves = unique(ok.flatMap((r) => r.review.findings.filter((f) => f.level === 'grave').map(text)));
        const finalGraves = unique(ok.flatMap((r) => r.review.finalFindings.map(text)));
        return (
          <View key={c.id} style={styles.card} testID={`ai-case-${c.id}`}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.why}>{c.why}</Text>
            {running?.startsWith(`${c.id}:`) ? (
              <Text style={styles.why}>
                Consultando… ({running.split(':')[1]} de {times})
              </Text>
            ) : null}
            {ok.length > 0 ? (
              <>
                <Text style={finalGraves.length ? styles.grave : styles.score}>
                  Semana final sin faltas graves: {ok.filter((r) => !r.review.finalFindings.length).length} de{' '}
                  {list.length}
                </Text>
                <Text style={styles.score}>
                  Respuesta de la IA sin faltas graves:{' '}
                  {ok.filter((r) => !r.review.findings.some((f) => f.level === 'grave')).length} de {list.length} · la app
                  corrigió {ok.reduce((n, r) => n + r.review.corrected, 0)}
                </Text>
                <Text style={styles.why}>
                  Notas: {ok.map((r) => r.review.score).join(' · ')} · {unique(ok.map((r) => r.model ?? '¿?')).join(', ')}
                </Text>
                {finalGraves.map((t) => (
                  <Text key={`f-${t}`} style={styles.grave}>
                    Queda en la semana final: {t}
                  </Text>
                ))}
                {rawGraves.map((t) => (
                  <Text key={`r-${t}`} style={styles.why}>
                    Grave en la respuesta de la IA: {t}
                  </Text>
                ))}
              </>
            ) : null}
            {errors.map((e, i) => (
              <Text key={`e-${i}`} style={styles.grave}>
                No respondió: {e}
              </Text>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const text = (f: { day: string | null; text: string }) => (f.day ? `${f.day}: ${f.text}` : f.text);

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
