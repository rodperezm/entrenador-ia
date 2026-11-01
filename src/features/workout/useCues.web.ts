import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect } from 'react';
import { sharedAudioContext } from './webAudio';

export type Cue = 'work' | 'rest' | 'count' | 'tick' | 'tock' | 'done';

const SOUNDS: Record<Cue, number> = {
  work: require('../../../assets/sounds/work.wav'),
  rest: require('../../../assets/sounds/rest.wav'),
  count: require('../../../assets/sounds/count.wav'),
  tick: require('../../../assets/sounds/tick.wav'),
  tock: require('../../../assets/sounds/tock.wav'),
  done: require('../../../assets/sounds/done.wav'),
};

const buffers: Partial<Record<Cue, AudioBuffer>> = {};
let voiceReady = false;

async function loadSounds() {
  const ctx = sharedAudioContext();
  await Promise.all(
    (Object.keys(SOUNDS) as Cue[]).map(async (cue) => {
      if (buffers[cue]) return;
      const asset = await Asset.fromModule(SOUNDS[cue]).downloadAsync();
      const data = await fetch(asset.localUri ?? asset.uri).then((r) => r.arrayBuffer());
      buffers[cue] = await ctx.decodeAudioData(data);
    }),
  );
}

// Safari permite la voz y el sonido después de que parten desde un toque.
function unlock() {
  sharedAudioContext()
    .resume()
    .catch(() => {});
  if (voiceReady || !('speechSynthesis' in window)) return;
  voiceReady = true;
  const silent = new SpeechSynthesisUtterance(' ');
  silent.volume = 0;
  window.speechSynthesis.speak(silent);
}

const TOUCH_EVENTS = ['touchend', 'click'] as const;

// Avisos del entrenamiento en el navegador: mismos sonidos y voz que en el teléfono.
export function useCues(enabled: boolean) {
  useEffect(() => {
    loadSounds().catch(() => {});
    // En captura: los botones detienen el evento antes de que llegue al documento.
    TOUCH_EVENTS.forEach((name) => document.addEventListener(name, unlock, true));
    return () => {
      TOUCH_EVENTS.forEach((name) => document.removeEventListener(name, unlock, true));
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const play = useCallback(
    (cue: Cue) => {
      if (!enabled) return;
      const buffer = buffers[cue];
      if (buffer) {
        const ctx = sharedAudioContext();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
      }
      if (cue === 'work' || cue === 'rest') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      if (cue === 'done') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    [enabled],
  );

  const say = useCallback(
    (text: string) => {
      if (!enabled || !('speechSynthesis' in window)) return;
      const speech = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 1.05;
      const voice = speech.getVoices().find((v) => v.lang.startsWith('es'));
      if (voice) utterance.voice = voice;
      speech.cancel();
      speech.speak(utterance);
    },
    [enabled],
  );

  return { play, say };
}
