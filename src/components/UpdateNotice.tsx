import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme';

// La app instalada en el teléfono sigue mostrando la versión con que se abrió, aunque ya haya otra
// publicada: el iPhone la mantiene en memoria. Al abrirla o volver a ella se compara con lo
// publicado y, si cambió, se ofrece actualizar. No se recarga sola: la persona puede estar en medio
// de un entrenamiento.

const CHECK_EVERY_MS = 5 * 60 * 1000;
const ENTRY = /entry-[a-f0-9]+\.js/;

/** El archivo principal con que se abrió esta copia y la dirección base de la app. */
function loaded() {
  const src = [...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src).find((s) => ENTRY.test(s));
  if (!src) return null;
  return { entry: src.match(ENTRY)![0], base: src.split('/_expo/')[0] };
}

export function UpdateNotice() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || __DEV__) return;
    const current = loaded();
    if (!current) return;
    let last = 0;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < CHECK_EVERY_MS) return;
      last = Date.now();
      try {
        const html = await fetch(`${current.base}/?v=${last}`, { cache: 'no-store' }).then((r) => r.text());
        const published = html.match(ENTRY)?.[0];
        if (!cancelled && published && published !== current.entry) setAvailable(true);
      } catch {
        // Sin conexión: se intenta en la próxima vuelta.
      }
    };
    void check();
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  if (!available) return null;
  return (
    <Pressable
      accessibilityRole="button"
      testID="update-notice"
      onPress={() => window.location.reload()}
      style={({ pressed }) => [styles.banner, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.text}>Hay una versión nueva · Toca para actualizar</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  text: { color: colors.black, fontSize: 13, fontWeight: '800', textAlign: 'center' },
});
