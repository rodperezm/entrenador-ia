import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo } from 'react';

export type Cue = 'work' | 'rest' | 'count' | 'tick' | 'tock' | 'done';

// Avisos del entrenamiento: pitidos (mismas frecuencias que el Tabata),
// voz en español y vibración.
export function useCues(enabled: boolean) {
  const work = useAudioPlayer(require('../../../assets/sounds/work.wav'));
  const rest = useAudioPlayer(require('../../../assets/sounds/rest.wav'));
  const count = useAudioPlayer(require('../../../assets/sounds/count.wav'));
  const tick = useAudioPlayer(require('../../../assets/sounds/tick.wav'));
  const tock = useAudioPlayer(require('../../../assets/sounds/tock.wav'));
  const done = useAudioPlayer(require('../../../assets/sounds/done.wav'));
  const players = useMemo(() => ({ work, rest, count, tick, tock, done }), [work, rest, count, tick, tock, done]);

  useEffect(() => {
    // Que suene aunque el iPhone esté en modo silencio.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => {
      Speech.stop().catch(() => {});
    };
  }, []);

  const play = useCallback(
    (cue: Cue) => {
      if (!enabled) return;
      const p = players[cue];
      try {
        p.seekTo(0);
        p.play();
      } catch {}
      if (cue === 'work' || cue === 'rest') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      if (cue === 'done') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    [enabled, players],
  );

  const say = useCallback(
    (text: string) => {
      if (!enabled) return;
      Speech.stop()
        .catch(() => {})
        .finally(() => Speech.speak(text, { language: 'es-ES', rate: 1.05 }));
    },
    [enabled],
  );

  return { play, say };
}
