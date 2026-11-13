import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

// Si hay conexión. En la web lo informa el navegador, que solo sabe si hay red (wifi o datos),
// no si internet responde de verdad. En la app nativa aún no se mide: se asume que sí.
const onWeb = Platform.OS === 'web' && typeof window !== 'undefined';

export const isOnline = () => !onWeb || navigator.onLine !== false;

const subscribe = (notify: () => void) => {
  if (!onWeb) return () => {};
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};

export const useOnline = () => useSyncExternalStore(subscribe, isOnline, () => true);
