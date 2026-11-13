import { BebasNeue_400Regular, useFonts } from '@expo-google-fonts/bebas-neue';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ConfirmHost } from '@/components/ConfirmDialog';
import { LoadingScreen } from '@/components/LoadingScreen';
import { WebSafeArea } from '@/components/WebSafeArea';
import { BodyProvider } from '@/state/body';
import { HistoryProvider } from '@/state/history';
import { PlanProvider } from '@/state/plan';
import { ProfileProvider } from '@/state/profile';
import { SyncProvider } from '@/state/sync';
import { listenForErrors } from '@/lib/report';
import { EnvironmentBanner } from '@/components/EnvironmentBanner';
import { UpdateNotice } from '@/components/UpdateNotice';
import { colors, display } from '@/theme';

// Si una pantalla falla, se muestra este aviso en vez de quedar en blanco.
export { ErrorScreen as ErrorBoundary } from '@/components/ErrorScreen';

// Si la letra no llega en este tiempo (sin conexión la primera vez), la app parte igual con la del sistema.
const FONT_WAIT_MS = 2500;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ BebasNeue_400Regular });
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  // Los errores que no llegan a una pantalla también se nos reportan.
  useEffect(listenForErrors, []);
  // Se espera la letra para que los títulos no aparezcan primero con otra y salten.
  if (!fontsLoaded && !fontError && !waited) return <LoadingScreen />;

  return (
    <ProfileProvider>
      <PlanProvider>
        <HistoryProvider>
          <BodyProvider>
            <SyncProvider>
              <StatusBar style="light" />
              <WebSafeArea>
                <EnvironmentBanner />
                <UpdateNotice />
                <Stack
                  screenOptions={{
                    headerStyle: { backgroundColor: colors.bg },
                    headerTintColor: colors.text,
                    headerTitleStyle: display(24),
                    headerShadowVisible: false,
                    headerBackTitle: 'Atrás',
                    contentStyle: { backgroundColor: colors.bg },
                  }}
                >
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="onboarding" options={{ title: '' }} />
                  <Stack.Screen name="profile" options={{ title: 'Mi perfil' }} />
                  <Stack.Screen name="feedback" options={{ title: 'Tu comentario' }} />
                  <Stack.Screen name="ai-cases" options={{ title: 'Casos de la IA' }} />
                  <Stack.Screen name="day/[day]" options={{ title: '' }} />
                  <Stack.Screen name="exercise/[id]" options={{ title: '' }} />
                  <Stack.Screen name="workout/[day]" options={{ headerShown: false, gestureEnabled: false }} />
                  <Stack.Screen name="body/new" options={{ title: '' }} />
                  <Stack.Screen name="guide" options={{ title: 'Guía de medición' }} />
                  <Stack.Screen name="timer" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="account" options={{ title: 'Cuenta y respaldo' }} />
                  <Stack.Screen name="privacy" options={{ title: 'Privacidad' }} />
                  <Stack.Screen name="terms" options={{ title: 'Términos y condiciones' }} />
                  <Stack.Screen name="plan-info" options={{ title: 'Cómo funciona tu plan' }} />
                  <Stack.Screen name="progress" options={{ title: 'Tu progreso' }} />
                </Stack>
                <ConfirmHost />
              </WebSafeArea>
            </SyncProvider>
          </BodyProvider>
        </HistoryProvider>
      </PlanProvider>
    </ProfileProvider>
  );
}
