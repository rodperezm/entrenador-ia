import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect } from 'react';
import { audioContext, wakeAudio } from './webAudio';

export type Cue = 'work' | 'rest' | 'count' | 'tick' | 'tock' | 'done';
type Sound = Cue | 'vamos' | 'lograste';

const SOUNDS: Record<Sound, number> = {
  work: require('../../../assets/sounds/work.wav'),
  rest: require('../../../assets/sounds/rest.wav'),
  count: require('../../../assets/sounds/count.wav'),
  tick: require('../../../assets/sounds/tick.wav'),
  tock: require('../../../assets/sounds/tock.wav'),
  done: require('../../../assets/sounds/done.wav'),
  vamos: require('../../../assets/sounds/vamos.wav'),
  lograste: require('../../../assets/sounds/lograste.wav'),
};

// En Safari la voz del navegador falla y corta el audio: se usan frases grabadas.
const VOICE: Record<string, Sound> = { '¡Vamos!': 'vamos', '¡Lo lograste!': 'lograste' };

const buffers: Partial<Record<Sound, AudioBuffer>> = {};
let loading = false;

async function loadSounds() {
  if (loading) return;
  loading = true;
  const ctx = audioContext();
  await Promise.all(
    (Object.keys(SOUNDS) as Sound[]).map(async (sound) => {
      const asset = await Asset.fromModule(SOUNDS[sound]).downloadAsync();
      const data = await fetch(asset.localUri ?? asset.uri).then((r) => r.arrayBuffer());
      buffers[sound] = await ctx.decodeAudioData(data);
    }),
  );
}

function unlock() {
  wakeAudio();
  loadSounds().catch(() => {
    loading = false;
  });
}

function playSound(sound: Sound) {
  const buffer = buffers[sound];
  if (!buffer) return;
  wakeAudio();
  const ctx = audioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
}

const TOUCH_EVENTS = ['touchend', 'click'] as const;

// Avisos del entrenamiento en el navegador: mismos sonidos que en el teléfono.
export function useCues(enabled: boolean) {
  useEffect(() => {
    // En captura: los botones detienen el evento antes de que llegue al documento.
    TOUCH_EVENTS.forEach((name) => document.addEventListener(name, unlock, true));
    return () => TOUCH_EVENTS.forEach((name) => document.removeEventListener(name, unlock, true));
  }, []);

  const play = useCallback(
    (cue: Cue) => {
      if (!enabled) return;
      playSound(cue);
      if (cue === 'work' || cue === 'rest') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      if (cue === 'done') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    [enabled],
  );

  const say = useCallback(
    (text: string) => {
      if (enabled && VOICE[text]) playSound(VOICE[text]);
    },
    [enabled],
  );

  return { play, say };
}
