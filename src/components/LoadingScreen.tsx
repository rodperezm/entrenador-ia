import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { colors, spacing } from '@/theme';

// Lo que se ve mientras la app lee los datos guardados o espera la letra de la marca.
// Si la carga es instantánea no se muestra nada: un logo que aparece y desaparece en una
// fracción de segundo molesta más que el fondo vacío.
const SHOW_AFTER_MS = 300;

export function LoadingScreen() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.screen} accessibilityRole="progressbar" accessibilityLabel="Cargando">
      {visible && (
        <>
          <Image source={require('../../assets/icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
          <ActivityIndicator color={colors.accent} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  logo: { width: 96, height: 96, borderRadius: 22 },
});
