import { router } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { MOVED_TO, shortAddress } from '@/lib/environment';
import { useSync } from '@/state/sync';
import { colors, radius, spacing } from '@/theme';

// Aviso de mudanza: aparece en «Hoy» cuando esta dirección va a dejar de ser la de la app.
// Los datos viven en cada teléfono y no viajan solos a la dirección nueva: quien tiene su cuenta
// con correo los recupera desde el respaldo; quien no, primero tiene que crearla.
export function MovedNotice() {
  const { enabled, status } = useSync();
  if (!MOVED_TO) return null;
  const address = shortAddress(MOVED_TO);
  const synced = enabled && status === 'ok';

  return (
    <View style={styles.card} testID="moved-notice">
      <Text style={styles.title}>KETTAI se muda a {address}</Text>
      {enabled ? (
        <>
          <Text style={styles.body}>
            {synced
              ? 'Tu respaldo está al día. Abre la dirección nueva y agrégala a tu pantalla de inicio. Después, desde ese ícono nuevo, toca «Ya tengo cuenta» y entra con tu correo: tus datos vuelven solos.'
              : 'Antes de cambiarte, espera a que tu respaldo quede al día en «Cuenta y respaldo». Después abre la dirección nueva, agrégala a tu pantalla de inicio y entra desde ese ícono con «Ya tengo cuenta».'}
          </Text>
          <Text style={styles.body}>
            En iPhone, entra desde el ícono nuevo y no desde Safari: cada uno guarda su sesión por separado. Cuando veas tus
            datos, borra este ícono.
          </Text>
          <View style={styles.actions}>
            {!synced ? <Button label="Ver mi respaldo" variant="secondary" onPress={() => router.push('/account')} /> : null}
            <Button label="Abrir la dirección nueva" onPress={() => Linking.openURL(MOVED_TO!)} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.body}>
            Tus datos están solo en este teléfono y no se cambian solos de dirección. Primero crea tu cuenta con tu correo:
            así los recuperas en la nueva.
          </Text>
          <View style={styles.actions}>
            <Button label="Crear mi cuenta" onPress={() => router.push('/account')} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});
