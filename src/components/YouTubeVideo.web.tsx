import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/theme';
import { YOUTUBE_ALLOW, youtubeEmbedUrl } from './youtube';

export function YouTubeVideo({ videoId, title }: { videoId: string; title: string }) {
  return (
    <View style={styles.frame}>
      <iframe
        src={youtubeEmbedUrl(videoId)}
        title={title}
        allow={YOUTUBE_ALLOW}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ width: '100%', height: '100%', border: 0 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface },
});
