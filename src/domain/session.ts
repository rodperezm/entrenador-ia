// Temporizador de intervalos tipo Tabata (herramienta opcional, independiente
// de la rutina). Portado de build() del temporizador Tabata del usuario.

export type TabataConfig = {
  rounds: number; // R
  exercises: number; // E: ejercicios por ronda
  workSec: number; // W
  restSec: number; // D: descanso entre ejercicios
  roundRestSec: number; // RR: descanso entre rondas
  prepSec: number; // P: cuenta antes de partir
  coolSec: number; // C: enfriamiento al final
};

export const DEFAULT_TABATA: TabataConfig = {
  rounds: 4,
  exercises: 8,
  workSec: 20,
  restSec: 10,
  roundRestSec: 30,
  prepSec: 10,
  coolSec: 60,
};

export type PhaseKind = 'prep' | 'work' | 'rest' | 'roundRest' | 'cool';
export type Phase = { kind: PhaseKind; durationSec: number; round?: number; exercise?: number };

export function buildTabata(c: TabataConfig): Phase[] {
  const p: Phase[] = [];
  if (c.prepSec > 0) p.push({ kind: 'prep', durationSec: c.prepSec });
  for (let r = 1; r <= c.rounds; r++) {
    for (let e = 1; e <= c.exercises; e++) {
      p.push({ kind: 'work', durationSec: c.workSec, round: r, exercise: e });
      if (e < c.exercises && c.restSec > 0) p.push({ kind: 'rest', durationSec: c.restSec, round: r, exercise: e });
    }
    if (r < c.rounds && c.roundRestSec > 0) p.push({ kind: 'roundRest', durationSec: c.roundRestSec, round: r });
  }
  if (c.coolSec > 0) p.push({ kind: 'cool', durationSec: c.coolSec });
  return p;
}

export const totalSeconds = (phases: Phase[]) => phases.reduce((t, p) => t + p.durationSec, 0);

export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
