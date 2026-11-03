import { useState } from 'react';
import { EXERCISES } from '@/data/exercises.seed';
import { guardAiPlan } from '@/domain/aiGuard';
import { bodyFat, calcIndices } from '@/domain/body';
import { cycleInfo } from '@/domain/cycle';
import { generateWeekByRules } from '@/domain/generator';
import { configHash, dayHashes, isFromPastWeek } from '@/domain/week';
import { useBody } from '@/state/body';
import { useHistory } from '@/state/history';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { AiPlanError, buildAiRequest, generateWeekWithAi } from './aiPlan';

// Arma la semana completa: primero con la IA y, si falla, con las reglas de la app.
// Lo usan «Hoy», «Mi semana» y la pantalla de un día cuando la semana aún está vacía.
export function useGenerateWeek() {
  const { profile } = useProfile();
  const { week, plan, savePlan } = usePlan();
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
      cycleBlock: cycleInfo(sessions, profile.level).blockStart,
    };
    // Mismo bloque: la Fuerza de cada día se conserva al volver a generar.
    const lockedByDay =
      plan?.cycleBlock === meta.cycleBlock
        ? Object.fromEntries(
            plan.days.map((d) => [
              d.day,
              d.blocks.filter((b) => b.type === 'main_strength').flatMap((b) => b.slots.map((s) => s.exerciseId)),
            ]),
          )
        : {};
    // La preparación previa al lunes es técnica: la arman las reglas, sin gastar IA.
    if (cycleInfo(sessions, profile.level).preparation) {
      const result = generateWeekByRules(week, profile, EXERCISES, sessions, Date.now(), lockedByDay);
      await savePlan({ ...result, ...meta, generator: 'rules' });
      setGenerating(false);
      return;
    }
    try {
      const last = records[0];
      const idx = last ? calcIndices(last, profile.heightCm) : null;
      const fat = folds[0] ? bodyFat(folds[0], profile.birthDate).pct : null;
      const request = buildAiRequest(
        week,
        profile,
        EXERCISES,
        sessions,
        {
          imc: idx?.imc ?? null,
          ice: idx?.ice ?? null,
          fatPct: fat,
          weightKg: last?.weightKg ?? null,
        },
        plan,
      );
      const { plan: aiPlan } = await generateWeekWithAi(request, week);
      const guarded = guardAiPlan(aiPlan, {
        days: week.days,
        profile,
        exercises: EXERCISES,
        history: sessions,
        lockedByDay,
        mainCandidates: request.candidates.filter((c) => c.blocks.includes('main_strength')).map((c) => c.id),
      });
      await savePlan({ ...guarded, ...meta, generator: 'llm' });
    } catch (err) {
      // Límite semanal: si ya hay una semana armada, se conserva tal como está.
      if (err instanceof AiPlanError && err.code === 'weekly_limit') {
        const hasCurrentWeek = !!plan?.days.length && !isFromPastWeek(plan.generatedAt);
        if (hasCurrentWeek) {
          setNotice('Ya armaste tu semana con IA. Tu semana sigue igual; el lunes podrás armar la siguiente.');
          setGenerating(false);
          return;
        }
        const result = generateWeekByRules(week, profile, EXERCISES, sessions, Date.now(), lockedByDay);
        await savePlan({ ...result, ...meta, generator: 'rules' });
        setNotice('Ya usaste tu semana con IA. Esta vez la armamos con las reglas de la app.');
        setGenerating(false);
        return;
      }
      // Respaldo: reglas dentro de la app (sin conexión, sin clave, etc.).
      const result = generateWeekByRules(week, profile, EXERCISES, sessions, Date.now(), lockedByDay);
      await savePlan({ ...result, ...meta, generator: 'rules' });
      const reason = err instanceof AiPlanError ? err.message : 'error inesperado';
      console.warn(`IA no disponible: ${reason}`);
      setNotice(
        'Esta vez la IA no pudo armar tu semana. La armamos con las reglas de la app. Puedes volver a intentarlo.',
      );
    } finally {
      setGenerating(false);
    }
  };

  return { generate, generating, notice };
}
