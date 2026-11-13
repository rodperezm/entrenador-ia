import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, radius, spacing } from '@/theme';
import { YOUTUBE_ALLOW, youtubeEmbedUrl } from './youtube';

// YouTube exige saber desde qué sitio se incrusta el video.
const BASE_URL = 'https://www.kettaiapp.com';

const page = (videoId: string, title: string) => `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html, body { margin: 0; height: 100%; background: #000 } iframe { width: 100%; height: 100%; border: 0 }</style>
<iframe src="${youtubeEmbedUrl(videoId)}" title="${title.replace(/"/g, '&quot;')}" allow="${YOUTUBE_ALLOW}"
  allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;

export function YouTubeVideo({ videoId, title }: { videoId: string; title: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={[styles.frame, styles.fallback]}>
        <Text style={styles.fallbackText}>No se pudo cargar el video. Revisa tu conexión.</Text>
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      <WebView
        source={{ html: page(videoId, title), baseUrl: BASE_URL }}
        originWhitelist={['*']}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        scrollEnabled={false}
        style={styles.web}
        onError={() => setFailed(true)}
        // Los enlaces del reproductor abren YouTube afuera, sin sacar a la persona de la app.
        onShouldStartLoadWithRequest={(request) => {
          const external = request.isTopFrame !== false && /^https?:/.test(request.url);
          if (!external || request.url.startsWith(BASE_URL)) return true;
          Linking.openURL(request.url).catch(() => {});
          return false;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.black },
  web: { flex: 1, backgroundColor: colors.black },
  fallback: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  fallbackText: { color: colors.textMuted, textAlign: 'center', fontWeight: '700' },
});
