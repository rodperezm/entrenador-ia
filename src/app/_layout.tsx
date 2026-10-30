import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WebSafeArea } from '@/components/WebSafeArea';
import { BodyProvider } from '@/state/body';
import { HistoryProvider } from '@/state/history';
import { PlanProvider } from '@/state/plan';
import { ProfileProvider } from '@/state/profile';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <ProfileProvider>
      <PlanProvider>
        <HistoryProvider>
          <BodyProvider>
            <StatusBar style="light" />
            <WebSafeArea>
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.bg },
                  headerTintColor: colors.text,
                  headerShadowVisible: false,
                  headerBackTitle: 'Atrás',
                  contentStyle: { backgroundColor: colors.bg },
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ title: '' }} />
                <Stack.Screen name="day/[day]" options={{ title: '' }} />
                <Stack.Screen name="exercise/[id]" options={{ title: '' }} />
                <Stack.Screen name="workout/[day]" options={{ headerShown: false, gestureEnabled: false }} />
                <Stack.Screen name="body/new" options={{ title: '' }} />
                <Stack.Screen name="guide" options={{ title: 'Guía de medición' }} />
                <Stack.Screen name="timer" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
              </Stack>
            </WebSafeArea>
          </BodyProvider>
        </HistoryProvider>
      </PlanProvider>
    </ProfileProvider>
  );
}
