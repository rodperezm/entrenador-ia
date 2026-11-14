// Uso de Claude en cada consulta: qué modelo respondió y cuántos tokens gastó, para conocer el
// costo real de cada semana. Sin dependencias, para poder probarlo también fuera de Deno.

export type ClaudeUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

// Lo que quedó de la llamada a Claude, si alcanzó a responder (aunque la respuesta no sirva).
export type ClaudeReply = { model: string | null; usage: ClaudeUsage | null };

export type UsageRecord = {
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  failed: boolean;
};

const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null);

// La fila que se guarda en ai_generations. `failed`: Claude respondió, pero la respuesta no sirvió.
export function usageRecord(reply: ClaudeReply, failed: boolean): UsageRecord {
  const u = reply.usage ?? {};
  return {
    model: reply.model || null,
    input_tokens: count(u.input_tokens),
    output_tokens: count(u.output_tokens),
    cache_read_tokens: count(u.cache_read_input_tokens),
    cache_write_tokens: count(u.cache_creation_input_tokens),
    failed,
  };
}

// Qué pasa con la reserva del cupo al terminar:
//  - success: hubo plan; la fila queda, cuenta para el cupo y guarda el gasto.
//  - failed: Claude respondió pero no sirvió; la fila queda con su gasto y NO cuenta para el cupo.
//  - release: Claude no alcanzó a responder; no hubo gasto y la fila se borra, como antes.
export function settle(outcome: { hasPlan: boolean; claude: ClaudeReply | null }): 'success' | 'failed' | 'release' {
  if (outcome.hasPlan) return 'success';
  return outcome.claude ? 'failed' : 'release';
}
