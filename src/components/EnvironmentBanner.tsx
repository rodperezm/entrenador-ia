import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { IS_TEST_ENV, PROD_URL, shortAddress } from '@/lib/environment';
import { colors } from '@/theme';

// Franja fija en el ambiente de pruebas, para que nadie lo confunda con la app real. Quien llegue
// aquí con un ícono antiguo puede tocarla para ir a la app real.
export function EnvironmentBanner() {
  if (!IS_TEST_ENV) return null;
  return (
    <Pressable
      style={styles.banner}
      testID="env-banner"
      accessibilityRole={PROD_URL ? 'link' : 'alert'}
      onPress={() => PROD_URL && Linking.openURL(PROD_URL)}
    >
      <Text style={styles.text}>
        PRUEBAS · {PROD_URL ? `la app real está en ${shortAddress(PROD_URL)}` : 'lo que hagas aquí no llega a la app real'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.warning, paddingVertical: 4, paddingHorizontal: 12 },
  text: { color: colors.black, fontSize: 12, fontWeight: '800', textAlign: 'center' },
});
