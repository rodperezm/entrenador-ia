import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { RoutineTone } from '@/domain/quickRoutines';
import { colors } from '@/theme';

// Color de cada rutina rápida: fondo, texto, texto secundario y tono vivo (ícono, barra de avance).
// El rojo de la marca queda para la rutina principal; las demás usan tonos apagados del mismo
// semáforo de la app, para que la pantalla tenga color sin competir con el botón principal.
export const ROUTINE_TONES: Record<RoutineTone, { bg: string; text: string; sub: string; vivid: string }> = {
  accent: { bg: colors.accent, text: colors.onAccent, sub: colors.onAccent, vivid: colors.onAccent },
  blue: { bg: '#16324A', text: '#CFE6F7', sub: '#9CC4E4', vivid: colors.low },
  green: { bg: '#12382A', text: '#D3F3E1', sub: '#8FD9B0', vivid: colors.good },
  amber: { bg: '#3D2C0C', text: '#FBE6BC', sub: '#E9C377', vivid: colors.warning },
  violet: { bg: '#2B2440', text: '#E2DBF7', sub: '#BDB5E6', vivid: '#AFA9EC' },
};

export const ROUTINE_ICONS: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  full: 'body-outline',
  upper: 'arrow-up-circle-outline',
  lower: 'arrow-down-circle-outline',
  sitting: 'desktop-outline',
  knees: 'walk-outline',
};
