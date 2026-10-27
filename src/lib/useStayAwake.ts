import { activateKeepAwakeAsync, deactivateKeepAwake, isAvailableAsync } from 'expo-keep-awake';
import { useEffect } from 'react';

// Como useKeepAwake, pero sin romper la pantalla si el sistema no lo permite
// (en web el wake lock puede fallar o no estar activo aún al desmontar).
export function useStayAwake(tag: string) {
  useEffect(() => {
    let active = false;
    isAvailableAsync()
      .then((ok) => (ok ? activateKeepAwakeAsync(tag).then(() => (active = true)) : undefined))
      .catch(() => {});
    return () => {
      if (active) deactivateKeepAwake(tag).catch(() => {});
    };
  }, [tag]);
}
