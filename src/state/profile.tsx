import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { LocalProfile } from '@/domain/schema';

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

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        // Si el formato guardado ya no es válido, se trata como sin perfil.
        const parsed = LocalProfile.safeParse(JSON.parse(raw));
        if (parsed.success) setProfile(parsed.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = useCallback(async (p: Omit<LocalProfile, 'updatedAt'>) => {
    const next = LocalProfile.parse({ ...p, updatedAt: new Date().toISOString() });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setProfile(next);
  }, []);

  const clearProfile = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setProfile(null);
  }, []);

  const importProfile = useCallback(async (p: LocalProfile) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    setProfile(p);
  }, []);

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
