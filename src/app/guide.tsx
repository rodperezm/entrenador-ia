import { Stack, useLocalSearchParams } from 'expo-router';
import { MeasurementGuide } from '@/features/body/MeasurementGuide';
import { useProfile } from '@/state/profile';

export default function GuideScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { profile } = useProfile();
  return (
    <>
      <Stack.Screen options={{ title: 'Guía de medición' }} />
      <MeasurementGuide
        initialTab={tab === 'folds' ? 'folds' : 'tape'}
        sex={profile?.sex ?? null}
        birthDate={profile?.birthDate ?? null}
      />
    </>
  );
}
