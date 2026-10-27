import type { BlockType, KettlebellGuide } from './schema';

export const BLOCK_LABELS: Record<BlockType, string> = {
  warmup: 'Calentamiento',
  prehab: 'Prehab',
  main_strength: 'Fuerza',
  cooldown: 'Elongación',
};

export const GRIP_LABELS: Record<KettlebellGuide['grip'], string> = {
  two_hand_horns: 'Dos manos por los cuernos',
  two_hand_handle: 'Dos manos en el asa',
  one_hand_handle: 'Una mano en el asa',
  rack: 'Posición de rack',
  bottoms_up: 'Invertida (base arriba)',
};
