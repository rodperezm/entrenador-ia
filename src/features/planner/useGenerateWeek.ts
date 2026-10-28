import { useState } from 'react';
import { EXERCISES } from '@/data/exercises.seed';
import { bodyFat, calcIndices } from '@/domain/body';
import { generateWeekByRules } from '@/domain/generator';
import { configHash, dayHashes } from '@/domain/week';
import { useBody } from '@/state/body';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { AiPlanError, buildAiRequest, generateWeekWithAi } from './aiPlan';

// Arma la semana completa: primero con la IA y, si falla, con las reglas de la app.
// Lo usan «Mi semana» y la pantalla de un día cuando la semana aún está vacía.
export function useGenerateWeek() {
  const { profile } = useProfile();
  const { week, savePlan } = usePlan();
  const { sessions } = useHistory();
  const { records, folds } = useBody();
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const generate = async () => {
    if (!profile) return;
    setGenerating(true);
    setNotice(null);
    const meta = {
      generatedAt: new Date().toISOString(),
      configHash: configHash(week, profile.updatedAt),
      dayHashes: dayHashes(week, profile.updatedAt),
    };
    try {
      const last = records[0];
      const idx = last ? calcIndices(last, profile.heightCm) : null;
      const fat = folds[0] ? bodyFat(folds[0], profile.birthDate).pct : null;
      const request = buildAiRequest(week, profile, EXERCISES, sessions, {
        imc: idx?.imc ?? null,
        ice: idx?.ice ?? null,
        fatPct: fat,
        weightKg: last?.weightKg ?? null,
      });
      const { plan: aiPlan } = await generateWeekWithAi(request, week);
      await savePlan({ ...aiPlan, ...meta, generator: 'llm' });
    } catch (err) {
      // Respaldo: reglas dentro de la app (sin conexión, sin clave, etc.).
      const result = generateWeekByRules(week, profile, EXERCISES, sessions);
      await savePlan({ ...result, ...meta, generator: 'rules' });
      const reason = err instanceof AiPlanError ? err.message : 'error inesperado';
      setNotice(`No se pudo usar la IA (${reason}). La rutina se armó con las reglas de la app.`);
    } finally {
      setGenerating(false);
    }
  };

  return { generate, generating, notice };
}
