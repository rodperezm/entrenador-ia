import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TERMS, TERMS_DATE_LABEL } from '@/content/terms';
import { colors, spacing } from '@/theme';

export default function TermsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.version}>Versión del {TERMS_DATE_LABEL}</Text>
      {TERMS.map((s) => (
        <View key={s.title} style={styles.section}>
          <Text style={styles.title} accessibilityRole="header">
            {s.title}
          </Text>
          {s.body.map((p) => (
            <Text key={p} style={styles.body}>
              {p}
            </Text>
          ))}
        </View>
      ))}
      <Link href="/privacy" style={styles.link}>
        Leer cómo cuidamos tus datos
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 },
  version: { color: colors.textMuted, fontSize: 13 },
  section: { gap: spacing.sm },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  link: { color: colors.link, fontSize: 15, fontWeight: '700', paddingVertical: spacing.sm },
});
