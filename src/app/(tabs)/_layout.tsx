import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderMenu } from '@/components/HeaderMenu';
import { LoadingScreen } from '@/components/LoadingScreen';
import { usePlan } from '@/state/plan';
import { useProfile } from '@/state/profile';
import { colors, display } from '@/theme';

// Si una pantalla falla, se muestra este aviso en vez de quedar en blanco.
export { ErrorScreen as ErrorBoundary } from '@/components/ErrorScreen';

const TAB_BAR_HEIGHT = 64;

export default function TabsLayout() {
  const { profile, loading } = useProfile();
  const { loading: planLoading } = usePlan();
  const insets = useSafeAreaInsets();
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
        // Más alta que la de fábrica (49): con la etiqueta de 12 puntos, el texto se cortaba por abajo.
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: TAB_BAR_HEIGHT + insets.bottom,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        // Alto de línea fijo y sin encogerse: si falta espacio, la etiqueta no se corta por la mitad.
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, flexShrink: 0 },
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
          title: 'Temporizador HIIT',
          tabBarLabel: 'HIIT',
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
