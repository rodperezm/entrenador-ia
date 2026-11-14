import { EXERCISES_BY_ID } from '@/data/exercises.seed';
import { bodyFat, FOLD_SITES, type FoldRecord, type TapeRecord } from '@/domain/body';
import { EQUIPMENT, MEDICAL_CONDITIONS, PARK_EQUIPMENT } from '@/domain/catalog';
import { CANT_DO_OPTIONS } from '@/domain/cantDo';
import { ARRIVAL_OPTIONS, zoneLabel } from '@/domain/checkIn';
import type { CheckIn, LocalProfile, SetLog, WorkoutSession } from '@/domain/schema';
import { DAY_LONG } from '@/domain/week';
import { buildXlsx, type Cell, type Sheet } from '@/lib/xlsx';

// "Mis datos" en Excel: una hoja por tema, legible sin conocer el formato interno.

type Data = {
  profile: LocalProfile | null;
  sessions: WorkoutSession[];
  records: TapeRecord[];
  folds: FoldRecord[];
};

const LEVEL = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' };
const PLACE = { home: 'Casa', park: 'Parque' };
const PAIN = ['Nada', 'Leve', 'Moderado', 'Fuerte'];
const SIDE = { left: 'Izquierdo', right: 'Derecho', both: 'Ambos' };
const FORMAT = { hiit: 'HIIT', amrap: 'AMRAP' };
const AFTER_WARMUP = { activated: 'Me activé', tired: 'Sigo cansado', very_tired: 'Muy cansado' };
const FEELING = { wanted_more: 'Me quedé con ganas', right: 'Justo', too_much: 'Fue mucho' };
const NEXT_DAY = { better: 'Mejor', same: 'Igual', worse: 'Peor' };
const arrivalText = (c: CheckIn | undefined) => {
  if (!c) return null;
  const label = ARRIVAL_OPTIONS.find((o) => o.id === c.arrival)?.label ?? c.arrival;
  return c.painZone ? `${label}: ${zoneLabel(c.painZone)}, ${PAIN[c.painLevel ?? 0].toLowerCase()}` : label;
};

const date = (iso: string) => iso.slice(0, 10);
const time = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
const round1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);
const exerciseName = (id: string) => EXERCISES_BY_ID.get(id)?.name.es ?? id;
const kg = (weights: number[], pairs: number[]) =>
  weights.map((k) => (pairs.includes(k) ? `2 × ${k} kg` : `${k} kg`)).join(', ');

function profileSheet(p: LocalProfile | null): Sheet {
  const rows: Cell[][] = [['Dato', 'Valor']];
  if (p) {
    rows.push(
      ['Nombre', p.displayName],
      ['Nivel', LEVEL[p.level]],
      ['Fecha de nacimiento', p.birthDate],
      ['Estatura (cm)', p.heightCm],
      ['Equipamiento', p.equipment.map((e) => EQUIPMENT[e]).join(', ')],
      ['En el parque', p.parkEquipment.map((e) => PARK_EQUIPMENT[e] ?? EQUIPMENT[e]).join(', ')],
      ['Kettlebells', kg(p.kettlebellWeightsKg, p.kettlebellPairsKg)],
      ['Mancuernas', kg(p.dumbbellWeightsKg, p.dumbbellPairsKg)],
      [
        'Lesiones o condiciones',
        p.conditions
          .map((c) => MEDICAL_CONDITIONS.find((m) => m.id === c.conditionId)?.name ?? c.conditionId)
          .join(', '),
      ],
    );
  }
  return { name: 'Perfil', rows };
}

function sessionsSheet(sessions: WorkoutSession[]): Sheet {
  const rows: Cell[][] = [
    [
      'Fecha',
      'Día',
      'Lugar',
      'Inicio',
      'Minutos',
      'Completa',
      'Ejercicios',
      'Series',
      'AMRAP',
      'Cómo llegó',
      'Tras calentar',
      'Cómo estuvo',
      'Al día siguiente',
      'No pudo hacer',
    ],
  ];
  for (const s of sessions) {
    const minutes = Math.round((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60000);
    const amrap = s.amrap ? `${s.amrap.rounds} vueltas + ${s.amrap.extraReps} reps en ${s.amrap.minutes} min` : null;
    rows.push([
      date(s.startedAt),
      DAY_LONG[s.day],
      PLACE[s.location],
      time(s.startedAt),
      minutes,
      s.completed ? 'Sí' : 'No',
      new Set(s.sets.map((l) => l.exerciseId)).size,
      s.sets.length,
      amrap,
      arrivalText(s.checkIn),
      s.checkIn?.afterWarmup ? AFTER_WARMUP[s.checkIn.afterWarmup] : null,
      s.feeling ? FEELING[s.feeling] : null,
      s.painFollowUp ? NEXT_DAY[s.painFollowUp] : null,
      [
        ...(s.cantDo ?? []).map(
          (c) =>
            `${exerciseName(c.exerciseId)} (${CANT_DO_OPTIONS.find((o) => o.id === c.reason)?.label.toLowerCase()})` +
            (c.replacedBy ? ` → ${exerciseName(c.replacedBy)}` : ''),
        ),
        ...(s.modified ?? []).map((id) => `${exerciseName(id)} (lo hizo modificado)`),
      ].join('; ') || null,
    ]);
  }
  return { name: 'Sesiones', rows };
}

function setsSheet(sessions: WorkoutSession[]): Sheet {
  const rows: Cell[][] = [
    [
      'Fecha',
      'Ejercicio',
      'Serie',
      'Reps meta',
      'Reps hechas',
      'Segundos',
      'Peso (kg)',
      'Esfuerzo (1-10)',
      'Dolor',
      'Lado del dolor',
      'Formato',
    ],
  ];
  for (const s of sessions) {
    for (const l of s.sets as SetLog[]) {
      const pain = l.painLevel ?? (l.painFlag ? 2 : 0);
      rows.push([
        date(s.startedAt),
        exerciseName(l.exerciseId),
        l.setNo,
        l.targetReps,
        l.repsDone,
        l.durationSec,
        l.weightKg,
        l.rpe,
        PAIN[pain],
        l.painSide ? SIDE[l.painSide] : null,
        l.format ? FORMAT[l.format] : null,
      ]);
    }
  }
  return { name: 'Series', rows };
}

function tapeSheet(records: TapeRecord[]): Sheet {
  const rows: Cell[][] = [['Fecha', 'Peso (kg)', 'Tórax (cm)', 'Cintura (cm)', 'Abdomen (cm)', 'Cadera (cm)']];
  for (const r of records) rows.push([r.date, r.weightKg, r.chestCm, r.waistCm, r.abdomenCm, r.hipCm]);
  return { name: 'Medidas', rows };
}

function foldsSheet(folds: FoldRecord[], birth: string | null): Sheet {
  const labels = [...new Set([...FOLD_SITES.male, ...FOLD_SITES.female].map((s) => s.label))];
  const rows: Cell[][] = [['Fecha', ...labels.map((l) => `${l} (mm)`), 'Suma (mm)', '% de grasa']];
  for (const f of folds) {
    const sites = FOLD_SITES[f.sex];
    const avg = (label: string) => {
      const site = sites.find((s) => s.label === label);
      const xs = site ? (f.sites[site.id] ?? []) : [];
      return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
    };
    const fat = bodyFat(f, birth);
    rows.push([f.date, ...labels.map(avg), round1(fat.sum), round1(fat.pct)]);
  }
  return { name: 'Pliegues', rows };
}

export function buildDataWorkbook({ profile, sessions, records, folds }: Data): Uint8Array {
  const byDate = <T>(xs: T[], key: (x: T) => string) => [...xs].sort((a, b) => key(a).localeCompare(key(b)));
  const ordered = byDate(sessions, (s) => s.startedAt);
  return buildXlsx([
    profileSheet(profile),
    sessionsSheet(ordered),
    setsSheet(ordered),
    tapeSheet(byDate(records, (r) => r.date)),
    foldsSheet(
      byDate(folds, (f) => f.date),
      profile?.birthDate ?? null,
    ),
  ]);
}
