// Huella corta de cada dato respaldado: con ella se sabe qué cambió desde la última subida
// sin guardar otra copia completa de todo en el teléfono.

const PREFIX = 'h1:';

// cyrb53: hash de 53 bits, rápido y suficiente para detectar cambios (no es criptográfico).
export function hashText(text: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return PREFIX + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Los datos que no cambian conservan el mismo objeto entre un guardado y otro: su huella
// se calcula una sola vez, en vez de volver a convertir todo el historial a texto cada vez.
const cache = new WeakMap<object, string>();

export function hashData(data: unknown) {
  if (data && typeof data === 'object') {
    const known = cache.get(data);
    if (known) return known;
    const hash = hashText(JSON.stringify(data));
    cache.set(data, hash);
    return hash;
  }
  return hashText(JSON.stringify(data));
}

export type Sent = Record<string, string>;

// El formato anterior guardaba el JSON completo de cada dato. Se convierte a su huella sin volver
// a subir nada: la huella de ese texto es la misma que la del dato.
export function migrateSent(stored: unknown): Sent {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>)
      .filter((e): e is [string, string] => typeof e[1] === 'string')
      .map(([key, value]) => [key, value.startsWith(PREFIX) ? value : hashText(value)]),
  );
}

// Lee lo guardado sin fallar: si no se entiende, se parte de cero (se vuelve a subir todo, sin daño).
export function parseSent(raw: string | null): Sent {
  try {
    return migrateSent(JSON.parse(raw ?? '{}'));
  } catch {
    return {};
  }
}
