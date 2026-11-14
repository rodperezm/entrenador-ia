// Carga segura de lo guardado en el teléfono. La regla: nunca sobrescribir datos que no se pudieron
// leer o entender sin dejar antes una copia tal como estaban.
//
// - Listas: se revisa registro por registro; los válidos se conservan y solo se descartan los inválidos.
// - Antes de descartar algo, el texto original se copia a `<clave>.bak`.
// - Si no se pudo leer, o no se pudo dejar la copia, la carga queda «no segura»: lo nuevo se guarda
//   en `<clave>.pending` y la clave principal no se toca hasta una carga buena.

export type KV = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type Schema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false } };

export const bakKey = (key: string) => `${key}.bak`;
export const pendingKey = (key: string) => `${key}.pending`;

export type Parsed<T> = { value: T; dropped: number };
export type Loaded<T> = {
  value: T | null;
  /** Registros que no se entendieron y quedaron fuera (su copia está en `.bak`). */
  dropped: number;
  /** false = no se puede sobrescribir la clave principal: no se leyó o no se pudo dejar la copia. */
  safe: boolean;
  /** Lo guardado aparte mientras la clave principal no se podía tocar. */
  pending: T | null;
};

// Conserva los registros válidos de una lista y cuenta los que no lo son.
export function salvageList<T>(input: unknown, schema: Schema<T>): Parsed<T[]> | null {
  if (!Array.isArray(input)) return null;
  const value: T[] = [];
  for (const raw of input) {
    const parsed = schema.safeParse(raw);
    if (parsed.success) value.push(parsed.data);
  }
  return { value, dropped: input.length - value.length };
}

// Un solo objeto (perfil, semana, rutina): válido o no.
export const parseWhole =
  <T>(schema: Schema<T>) =>
  (json: unknown): Parsed<T> | null => {
    const parsed = schema.safeParse(json);
    return parsed.success ? { value: parsed.data, dropped: 0 } : null;
  };

const READ_TRIES = 3;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readWithRetry(kv: KV, key: string, retryMs: number) {
  for (let i = 1; ; i++) {
    try {
      return await kv.getItem(key);
    } catch (e) {
      if (i >= READ_TRIES) throw e;
      await wait(retryMs);
    }
  }
}

// Copia el texto original. La primera copia se conserva (suele ser la más completa); si ya existe
// una distinta, la nueva va a `.bak.1`. Responde si la copia quedó guardada.
export async function backupRaw(kv: KV, key: string, raw: string) {
  try {
    const existing = await kv.getItem(bakKey(key));
    if (existing === raw) return true;
    await kv.setItem(existing == null ? bakKey(key) : `${bakKey(key)}.1`, raw);
    return true;
  } catch {
    return false;
  }
}

const parseJson = (raw: string): { ok: true; json: unknown } | { ok: false } => {
  try {
    return { ok: true, json: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
};

export async function loadSafely<T>(
  kv: KV,
  key: string,
  parse: (json: unknown) => Parsed<T> | null,
  retryMs = 150,
): Promise<Loaded<T>> {
  // Lo guardado aparte en una carga anterior que falló: se devuelve para combinarlo.
  let pending: T | null = null;
  try {
    const rawPending = await kv.getItem(pendingKey(key));
    const json = rawPending ? parseJson(rawPending) : null;
    pending = (json?.ok ? parse(json.json)?.value : null) ?? null;
  } catch {
    // Sin lo pendiente se sigue igual: queda guardado para la próxima carga.
  }

  let raw: string | null;
  try {
    raw = await readWithRetry(kv, key, retryMs);
  } catch {
    return { value: null, dropped: 0, safe: false, pending };
  }
  if (raw == null) return { value: null, dropped: 0, safe: true, pending };

  const json = parseJson(raw);
  const parsed = json.ok ? parse(json.json) : null;
  if (parsed && parsed.dropped === 0) return { value: parsed.value, dropped: 0, safe: true, pending };

  // Algo no se entendió: primero la copia, y solo si quedó guardada se permite sobrescribir.
  const safe = await backupRaw(kv, key, raw);
  return { value: parsed?.value ?? null, dropped: parsed?.dropped ?? 1, safe, pending };
}

// Guarda el estado: en la clave principal si la carga fue segura; si no, aparte.
export async function persistSafely(kv: KV, key: string, value: unknown, safe: boolean) {
  await kv.setItem(safe ? key : pendingKey(key), JSON.stringify(value));
  if (safe) await kv.removeItem(pendingKey(key)).catch(() => {});
}

// Antes de escribir sobre una clave cuya carga no fue segura (por ejemplo, al guardar un perfil
// nuevo): un último intento de dejar copia de lo que haya.
export async function backupBeforeOverwrite(kv: KV, key: string) {
  try {
    const raw = await kv.getItem(key);
    if (raw != null) await backupRaw(kv, key, raw);
  } catch {
    // No se pudo leer: no hay nada que copiar.
  }
}
