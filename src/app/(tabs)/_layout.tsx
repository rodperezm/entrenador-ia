import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, Tabs } from 'expo-router';
import { HeaderMenu } from '@/components/HeaderMenu';
import { LoadingScreen } from '@/components/LoadingScreen';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, display } from '@/theme';

// Si una pantalla falla, se muestra este aviso en vez de quedar en blanco.
export { ErrorScreen as ErrorBoundary } from '@/components/ErrorScreen';

export default function TabsLayout() {
  const { profile, loading } = useProfile();
  const { loading: planLoading } = usePlan();
  if (loading || planLoading) return <LoadingScreen />;
  if (!profile) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: display(26),
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 12 },
        headerRight: () => <HeaderMenu />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hoy',
          tabBarIcon: ({ color, size }) => <Ionicons name="today-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="week"
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
