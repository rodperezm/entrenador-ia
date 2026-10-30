import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Redirect, router, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, spacing } from '@/theme';

export default function TabsLayout() {
  const { profile, loading } = useProfile();
  const { loading: planLoading } = usePlan();
  if (loading || planLoading) return null;
  if (!profile) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        headerRight: () => (
          <Link href="/onboarding" style={styles.profileLink}>
            Mi perfil
          </Link>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mi semana',
          tabBarLabel: 'Semana',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          title: 'Ejercicios',
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="body"
        options={{
          title: 'Cuerpo',
          tabBarIcon: ({ color, size }) => <Ionicons name="body-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tabata"
        options={{
          title: 'Tabata/HIIT',
          tabBarIcon: ({ color, size }) => <Ionicons name="timer-outline" color={color as string} size={size} />,
        }}
        listeners={{
          // El temporizador se abre a pantalla completa en vez de como pestaña.
          tabPress: (e) => {
            e.preventDefault();
            router.push('/timer');
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  profileLink: { color: colors.accent, fontWeight: '700', fontSize: 15, paddingHorizontal: spacing.lg },
});
