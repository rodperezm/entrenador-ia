import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';
import { useBody } from './body';
import { useHistory } from './history';
import { usePlan } from './plan';
import { useProfile } from './profile';
import { useSync } from './sync';

// Borra todo lo que el usuario guardó en este teléfono (perfil, semana,
// rutina, historial y medidas) y vuelve al inicio para partir de cero.
// Con respaldo activo, primero cierra la sesión: si no, el borrado se copiaría a la nube.
// Pide confirmación antes, porque no se puede deshacer.
export function useResetAllData() {
  const { clearProfile } = useProfile();
  const { resetPlan } = usePlan();
  const { clearHistory } = useHistory();
  const { clearBody } = useBody();
  const { enabled, signOut } = useSync();

  const reset = async () => {
    if (enabled) await signOut();
    clearHistory();
    clearBody();
    await resetPlan();
    await clearProfile();
    router.replace('/');
  };

  return () => {
    const title = '¿Borrar todos tus datos?';
    const message = enabled
      ? 'Se borran de este teléfono y se cierra tu sesión. Tu respaldo en la nube se mantiene: para borrarlo, usa Cuenta y respaldo.'
      : 'Se borran tu perfil, tu semana, las rutinas, el historial de entrenamientos y tus medidas de este teléfono. No se puede deshacer.';
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) reset();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar todo', style: 'destructive', onPress: reset },
    ]);
  };
}
