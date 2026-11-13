import { FunctionsHttpError } from '@supabase/supabase-js';
import type { WeekConfig } from '@/domain/schema';
import { AiPlanError, checkAiPlan } from './aiCheck';
import type { buildAiRequest } from './aiRequest';
import { ensureSession, SessionLostError, supabase } from '@/lib/supabase';

// Arma la rutina con Claude a través de la Edge Function "generate-plan".
// El LLM solo ve ejercicios ya filtrados por restricciones y equipamiento, y
// lo que devuelve se valida otra vez aquí antes de usarlo.

export { buildAiRequest, type BodySnapshot } from './aiRequest';
export { AiPlanError, checkAiPlan } from './aiCheck';


const REASONS: Record<string, string> = {
  weekly_limit: 'ya usaste las semanas con IA de esta semana',
  quota_unavailable: 'no se pudo revisar tu límite semanal',
  unauthorized: 'la sesión con el servidor no es válida',
  anthropic_key_invalid: 'el servicio de IA no está disponible por ahora',
  daily_cap: 'hoy se armaron muchas semanas con IA; inténtalo mañana o arma tu semana con las reglas',
  needs_account: 'para usar la IA primero crea tu cuenta con tu correo',
  too_large: 'el pedido quedó demasiado grande',
  bad_request: 'el pedido no era válido',
  rate_limited: 'Claude está saturado en este momento',
  refusal: 'Claude no pudo armar esta rutina',
  truncated: 'la respuesta de Claude quedó incompleta',
  anthropic_error: 'Claude tuvo un problema al responder',
};

// Devuelve la respuesta tal como llega de la función. `model` solo sirve para comparar modelos más
// económicos en los casos fijos de la IA.
export async function requestAiPlan(request: ReturnType<typeof buildAiRequest>, model?: string) {
  try {
    await ensureSession();
  } catch (e) {
    if (e instanceof SessionLostError) throw new AiPlanError(e.message, 'session_lost');
    throw new AiPlanError('no se pudo iniciar sesión en Supabase');
  }

  const { data: raw, error } = await supabase.functions.invoke('generate-plan', {
    body: model ? { ...request, model } : request,
  });
  if (error) {
    let code = '';
    if (error instanceof FunctionsHttpError) {
      code = ((await error.context.json().catch(() => ({}))) as { error?: string }).error ?? '';
    }
    throw new AiPlanError(REASONS[code] ?? 'el servidor no respondió', code);
  }

  // La función responde en flujo para no perder la conexión, y sus errores vienen dentro del JSON.
  // En Expo Go la respuesta no es instancia del Response global: se reconoce por tener text().
  const data =
    typeof raw?.text === 'function'
      ? await raw
          .text()
          .then(JSON.parse)
          .catch(() => null)
      : raw;
  if (!data || data.error) {
    const reason = REASONS[data?.error] ?? 'el servidor no respondió';
    throw new AiPlanError(data?.status ? `${reason} (código ${data.status})` : reason);
  }

  return data as { plan?: { summary?: unknown; days?: { day?: unknown }[] }; model?: string; usage?: unknown };
}

export async function generateWeekWithAi(request: ReturnType<typeof buildAiRequest>, week: WeekConfig) {
  const data = await requestAiPlan(request);
  return { plan: checkAiPlan(data, request, week), model: data.model ?? null, usage: data.usage ?? null };
}
