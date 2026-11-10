import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { LocalProfile } from '@/domain/schema';
import { backupBeforeOverwrite, loadSafely, parseWhole } from '@/lib/safeStore';

const STORAGE_KEY = 'profile.v1';

type ProfileState = {
  profile: LocalProfile | null;
  loading: boolean;
  saveProfile: (p: Omit<LocalProfile, 'updatedAt'>) => Promise<void>;
  clearProfile: () => Promise<void>;
  /** Trae el perfil de la nube tal como está, sin cambiar su fecha. */
  importProfile: (p: LocalProfile) => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // La carga no dejó copia de lo que había (no se pudo leer o copiar): antes de escribir se reintenta.
  const unsafe = useRef(false);

  useEffect(() => {
    // Si el formato guardado ya no es válido, se trata como sin perfil, pero el original queda
    // en profile.v1.bak antes de que un perfil nuevo lo reemplace.
    loadSafely(AsyncStorage, STORAGE_KEY, parseWhole(LocalProfile))
      .then((res) => {
        if (res.value) setProfile(res.value);
        unsafe.current = !res.safe;
        if (res.dropped || !res.safe) console.warn('Perfil: no se pudo leer lo guardado');
      })
      .finally(() => setLoading(false));
  }, []);

  const write = useCallback(async (p: LocalProfile) => {
    if (unsafe.current) await backupBeforeOverwrite(AsyncStorage, STORAGE_KEY);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    unsafe.current = false;
  }, []);

  // Guardar sin cambios no cambia la fecha: la semana compara con ella para saber si quedó desactualizada.
  const saveProfile = useCallback(
    async (p: Omit<LocalProfile, 'updatedAt'>) => {
      const next = LocalProfile.parse({ ...p, updatedAt: new Date().toISOString() });
      const withoutDate = ({ updatedAt: _u, ...rest }: LocalProfile) => JSON.stringify(rest);
      if (profile && withoutDate(profile) === withoutDate(next)) return;
      await write(next);
      setProfile(next);
    },
    [profile, write],
  );

  const clearProfile = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setProfile(null);
  }, []);

  const importProfile = useCallback(
    async (p: LocalProfile) => {
      await write(p);
      setProfile(p);
    },
    [write],
  );

  return (
    <ProfileContext.Provider value={{ profile, loading, saveProfile, clearProfile, importProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile debe usarse dentro de <ProfileProvider>');
  return ctx;
}
