import type { KV } from '@/lib/safeStore';

// Almacenamiento en memoria para las pruebas, con fallas a pedido.
export function memoryKV(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const fail = { read: new Set<string>(), write: new Set<string>() };
  const kv: KV = {
    getItem: async (k) => {
      if (fail.read.has(k)) throw new Error('no se pudo leer ' + k);
      return data.get(k) ?? null;
    },
    setItem: async (k, v) => {
      if (fail.write.has(k)) throw new Error('no se pudo escribir ' + k);
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
  return { kv, data, fail };
}
