import { StyleSheet, Text, View } from 'react-native';
import { IS_TEST_ENV } from '@/lib/environment';
import { colors } from '@/theme';

// Franja fija en el ambiente de pruebas, para que nadie lo confunda con la app real.
export function EnvironmentBanner() {
  if (!IS_TEST_ENV) return null;
  return (
    <View style={styles.banner} testID="env-banner" accessibilityRole="alert">
      <Text style={styles.text}>PRUEBAS · lo que hagas aquí no llega a la app real</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.warning, paddingVertical: 4, paddingHorizontal: 12 },
  text: { color: colors.black, fontSize: 12, fontWeight: '800', textAlign: 'center' },
});
