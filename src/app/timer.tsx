import { BebasNeue_400Regular, useFonts } from '@expo-google-fonts/bebas-neue';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStayAwake } from '@/lib/useStayAwake';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildTabata,
  DEFAULT_TABATA,
  fmtClock,
  type PhaseKind,
  type TabataConfig,
  totalSeconds,
} from '@/domain/session';
import { useCues } from '@/features/workout/useCues';
import { MAX_TRACK_SEC } from '@/features/workout/tabataTrack';
import { useRunner } from '@/features/workout/useRunner';
import { useTrackRunner } from '@/features/workout/useTrackRunner';

// Temporizador Tabata opcional, réplica de la app del usuario
// (github.com/rodperezm/tabata-app): mismos colores, textos y comportamiento.

const STORAGE_KEY = 'tabata-config.v1';

// Tema oscuro del original.
const T = {
  bg: '#171B2B',
  fg: '#F0EEE9',
  bar: '#10131F',
  card: '#222845',
  mut: '#a3a7bd',
  bd: '#343b60',
  n1: '#6FA6D6', // rondas
  n2: '#CBD33A', // ejercicios, total, botón
  ink: '#1E2233',
};

type Look = PhaseKind | 'idle' | 'done';
// Paleta del original (Pantone 2026).
const COL: Record<Look, [string, string]> = {
  idle: ['#F0EEE9', '#1E2233'],
  prep: ['#CBD33A', '#1E2233'],
  work: ['#CF2B58', '#FFFFFF'],
  rest: ['#6DB89B', '#1E2233'],
  roundRest: ['#6FA6D6', '#1E2233'],
  cool: ['#C6B4D6', '#1E2233'],
  done: ['#6DB89B', '#1E2233'],
};
const NAME: Record<Look, string> = {
  idle: 'Listo',
  prep: 'Prepárate',
  work: '¡Entrena!',
  rest: 'Descanso',
  roundRest: 'Descanso de ronda',
  cool: 'Enfriamiento',
  done: '¡Lo lograste!',
};
const NEXT_LABEL: Record<PhaseKind, string> = {
  prep: 'Prepárate',
  work: 'Entrenar',
  rest: 'Descanso',
  roundRest: 'Descanso de ronda',
  cool: 'Enfriamiento',
};

const FIELDS: { key: keyof TabataConfig; label: string; min: number; max: number; step: number }[] = [
  { key: 'rounds', label: 'Rondas', min: 1, max: 99, step: 1 },
  { key: 'exercises', label: 'Ejercicios por ronda', min: 1, max: 99, step: 1 },
  { key: 'workSec', label: 'Ejecución por ejercicio (seg)', min: 1, max: 600, step: 5 },
  { key: 'restSec', label: 'Descanso entre ejercicios (seg)', min: 0, max: 600, step: 5 },
  { key: 'roundRestSec', label: 'Descanso entre rondas (seg)', min: 0, max: 600, step: 5 },
  { key: 'prepSec', label: 'Cuenta antes de partir (seg)', min: 0, max: 120, step: 5 },
  { key: 'coolSec', label: 'Enfriamiento al final (seg)', min: 0, max: 900, step: 5 },
];

export default function TimerScreen() {
  useStayAwake('timer');
  const insets = useSafeAreaInsets();
  // Tamaños como el original: clamp(130px, 44vw, 230px) y clamp(44px, 14vw, 76px).
  const { width } = useWindowDimensions();
  const timeSize = Math.min(230, Math.max(130, width * 0.44));
  const phaseSize = Math.min(76, Math.max(44, width * 0.14));
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  const font = fontsLoaded ? 'BebasNeue_400Regular' : undefined;
  const [cfg, setCfg] = useState<TabataConfig>(DEFAULT_TABATA);
  const [tab, setTab] = useState<'home' | 'cfg'>('home');
  const [stageH, setStageH] = useState(0);
  const phases = useMemo(() => buildTabata(cfg), [cfg]);
  const durations = useMemo(() => phases.map((p) => p.durationSec), [phases]);
  // Como el original: en el teléfono, una sola pista de audio marca el tiempo;
  // en web (o si dura más de 40 min) se usa el modo "en vivo" con pitidos sueltos.
  const live = Platform.OS === 'web' || totalSeconds(phases) > MAX_TRACK_SEC;
  const liveRunner = useRunner(durations);
  const trackRunner = useTrackRunner(phases);
  const runner = live ? liveRunner : trackRunner;
  const cues = useCues(true);
  const lastSec = useRef<number | null>(null);
  const tickCount = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setCfg({ ...DEFAULT_TABATA, ...JSON.parse(raw) }))
      .catch(() => {});
  }, []);

  const { status, index, remainingSec } = runner;
  const active = status === 'running' || status === 'paused';
  const phase = active ? phases[index] : null;

  // Al cambiar de fase: voz "¡Vamos!" al primer ejercicio. En modo en vivo,
  // además 880 Hz al entrenar y 500 Hz en descansos (en la pista ya vienen).
  useEffect(() => {
    if (!phase) return;
    if (phase.kind === 'work') {
      if (live) cues.play('work');
      if (phase.round === 1 && phase.exercise === 1) cues.say('¡Vamos!');
    } else if (phase.kind !== 'prep' && live) {
      cues.play('rest');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, active]);

  // Solo modo en vivo: tic-tac alternado (1500/950 Hz) y 700 Hz en los últimos 3.
  const sec = Math.ceil(remainingSec);
  useEffect(() => {
    if (!live || status !== 'running' || sec === lastSec.current) return;
    const first = lastSec.current == null;
    lastSec.current = sec;
    if (first || sec <= 0) return;
    if (sec <= 3) cues.play('count');
    else cues.play(tickCount.current++ % 2 ? 'tock' : 'tick');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec, status]);

  useEffect(() => {
    if (status === 'done') {
      if (live) cues.play('done');
      cues.say('¡Lo lograste!');
    }
    if (!active) lastSec.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const update = (key: keyof TabataConfig, v: number) => {
    const next = { ...cfg, [key]: v };
    setCfg(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const showTab = (which: 'home' | 'cfg') => {
    if (which === 'cfg' && status === 'running') runner.pause();
    setTab(which);
  };

  // ---------- Lo que se muestra (misma lógica que render() del original) ----------
  const total = totalSeconds(phases);
  let look: Look = 'idle';
  let time = phases[0]?.durationSec ?? 0;
  let totalLeft = total;
  let roundsLeft = cfg.rounds;
  let exLeft = cfg.exercises;
  let next: { look: Look; label: string; value: number } = {
    look: 'work',
    label: NEXT_LABEL.work,
    value: cfg.workSec,
  };
  let goLabel = 'Empezar';

  if (status === 'done') {
    look = 'done';
    time = 0;
    roundsLeft = 0;
    exLeft = 0;
    next = { look: 'done', label: 'Duración total', value: total };
    goLabel = 'Reiniciar';
  } else if (phase) {
    look = phase.kind;
    time = remainingSec;
    totalLeft = remainingSec + totalSeconds(phases.slice(index + 1));
    if (phase.kind === 'work') {
      roundsLeft = cfg.rounds - phase.round! + 1;
      exLeft = cfg.exercises - phase.exercise! + 1;
    } else if (phase.kind === 'rest') {
      roundsLeft = cfg.rounds - phase.round! + 1;
      exLeft = cfg.exercises - phase.exercise!;
    } else if (phase.kind === 'roundRest') {
      roundsLeft = cfg.rounds - phase.round!;
    } else if (phase.kind === 'cool') {
      roundsLeft = 0;
      exLeft = 0;
    }
    const upcoming = phases[index + 1];
    next = upcoming
      ? { look: upcoming.kind, label: NEXT_LABEL[upcoming.kind], value: upcoming.durationSec }
      : { look: 'done', label: 'Último tramo', value: remainingSec };
    goLabel = status === 'paused' ? 'Continuar' : 'Pausar';
  }

  const onGo = () => {
    if (status === 'idle') runner.start();
    else if (status === 'running') runner.pause();
    else if (status === 'paused') runner.resume();
    else runner.reset();
  };

  const f = (style: object) => [style, font ? { fontFamily: font } : styles.fallbackFont];

  // Que la fase y el número quepan en el recuadro de color: el tamaño depende
  // del ancho (como el original) pero también del alto real del recuadro, y los
  // textos largos ("Descanso de ronda") se achican para ir en una sola línea.
  // Bebas Neue mide ~0,43 em por letra; los dígitos ~0,42 em.
  const phaseLabel = status === 'paused' ? 'En pausa' : NAME[look];
  const usableW = width - 32;
  const phaseFit = Math.min(phaseSize, usableW / (phaseLabel.length * 0.43), stageH ? stageH * 0.2 : phaseSize);
  const timeFit = Math.min(timeSize, usableW / (5 * 0.42), stageH ? stageH * 0.62 : timeSize);

  // Sin la tipografía, la letra de respaldo es más ancha y corta los números.
  if (!fontsLoaded) return <View style={styles.app} />;

  return (
    <View style={[styles.app, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Encabezado */}
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} style={styles.close} hitSlop={10} accessibilityLabel="Cerrar">
          <Ionicons name="chevron-down" size={26} color={T.mut} />
        </Pressable>
        <Text style={f(styles.headTitle)}>TABATA/HIIT</Text>
        <Text style={f(styles.headTotal)}>{fmtClock(totalLeft)}</Text>
        <Pressable onPress={runner.reset} style={styles.reset} accessibilityLabel="Reiniciar">
          <Ionicons name="refresh" size={24} color={T.n2} />
        </Pressable>
      </View>

      {tab === 'home' ? (
        <View style={styles.screen}>
          <View
            style={[styles.stage, { backgroundColor: COL[look][0] }]}
            onLayout={(e) => setStageH(e.nativeEvent.layout.height)}
          >
            <Text
              style={f([styles.phase, { color: COL[look][1], fontSize: phaseFit, lineHeight: phaseFit * 1.15 }])}
              numberOfLines={1}
            >
              {phaseLabel}
            </Text>
            <Text
              style={f([styles.time, { color: COL[look][1], fontSize: timeFit, lineHeight: timeFit * 1.05 }])}
              numberOfLines={1}
            >
              {fmtClock(time)}
            </Text>
          </View>

          <View style={[styles.next, { backgroundColor: COL[next.look][0] }]}>
            <Text style={f([styles.nextLabel, { color: COL[next.look][1] }])}>{next.label}</Text>
            <Text style={f([styles.nextValue, { color: COL[next.look][1] }])}>{fmtClock(next.value)}</Text>
          </View>

          <View style={styles.ctl}>
            <View style={styles.counter}>
              <Text style={f([styles.counterNum, { color: T.n1 }])}>{roundsLeft}</Text>
              <Text style={f(styles.counterLabel)}>{'Rondas\nrestantes'}</Text>
            </View>
            <View style={styles.goCol}>
              <Pressable onPress={onGo} style={styles.go} accessibilityLabel={goLabel}>
                <View style={styles.goRing}>
                  <Ionicons
                    name={status === 'running' ? 'pause' : status === 'done' ? 'refresh' : 'play'}
                    size={46}
                    color={T.ink}
                    style={status === 'idle' || status === 'paused' ? { marginLeft: 6 } : undefined}
                  />
                </View>
              </Pressable>
              <Text style={f(styles.goLabel)} numberOfLines={1}>
                {goLabel}
              </Text>
            </View>
            <View style={styles.counter}>
              <Text style={f([styles.counterNum, { color: T.n2 }])}>{exLeft}</Text>
              <Text style={f(styles.counterLabel)}>{'Ejercicios\nrestantes'}</Text>
            </View>
          </View>
        </View>
      ) : (
        <ScrollView style={styles.screen} contentContainerStyle={styles.cfg}>
          <Text style={f(styles.cfgTitle)}>Configurar</Text>
          {FIELDS.map((field) => (
            <View key={field.key} style={styles.row}>
              <Text style={styles.rowLabel}>{field.label}</Text>
              <View style={styles.step}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => update(field.key, Math.max(field.min, cfg[field.key] - field.step))}
                  accessibilityLabel="Menos"
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={f(styles.stepValue)}>{cfg[field.key]}</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => update(field.key, Math.min(field.max, cfg[field.key] + field.step))}
                  accessibilityLabel="Más"
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <Pressable
            style={styles.test}
            onPress={() => {
              cues.play('work');
              setTimeout(() => cues.play('tick'), 500);
              setTimeout(() => cues.play('tock'), 1000);
              setTimeout(() => cues.say('¡Vamos!'), 1400);
            }}
          >
            <Text style={styles.testText}>🔊 Probar sonido</Text>
          </Pressable>
          <Text style={styles.hint}>
            Pon 0 en cualquier tiempo opcional para saltarlo. Los cambios se guardan solos y se aplican al pulsar
            Empezar en Inicio.
          </Text>
        </ScrollView>
      )}

      {/* Pestañas */}
      <View style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {(
          [
            ['home', 'Inicio', 'timer-outline'],
            ['cfg', 'Configurar', 'options-outline'],
          ] as const
        ).map(([id, label, icon]) => {
          const on = tab === id;
          return (
            <Pressable key={id} onPress={() => showTab(id)} style={[styles.tab, on && styles.tabOn]}>
              <Ionicons name={icon} size={26} color={on ? T.bar : T.fg} />
              <Text style={f([styles.tabText, { color: on ? T.bar : T.fg }])}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: T.bg },
  fallbackFont: { fontWeight: '800' },
  head: { alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  close: { position: 'absolute', left: 14, top: 18 },
  headTitle: { color: T.fg, fontSize: 30, letterSpacing: 1.2, lineHeight: 32, opacity: 0.85 },
  headTotal: { color: T.n2, fontSize: 40, lineHeight: 44 },
  reset: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: T.n2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: { flex: 1 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, overflow: 'hidden' },
  phase: { textTransform: 'uppercase', textAlign: 'center' },
  time: { fontVariant: ['tabular-nums'] },
  next: { alignItems: 'center', paddingTop: 10, paddingBottom: 12 },
  nextLabel: { fontSize: 34, lineHeight: 36, textTransform: 'uppercase' },
  nextValue: { fontSize: 76, lineHeight: 78 },
  ctl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.bar,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  counter: { flex: 1, alignItems: 'center' },
  goCol: { alignItems: 'center', minWidth: 140, paddingHorizontal: 4 },
  counterNum: { fontSize: 84, lineHeight: 86 },
  counterLabel: { color: T.fg, fontSize: 22, lineHeight: 23, textAlign: 'center', textTransform: 'uppercase' },
  go: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: T.n2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: T.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goLabel: { color: T.n2, fontSize: 34, lineHeight: 36, marginTop: 6, textTransform: 'uppercase' },
  cfg: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 10 },
  cfgTitle: { color: T.fg, fontSize: 38, letterSpacing: 1, marginBottom: 2, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.bd,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowLabel: { color: T.fg, fontSize: 15, lineHeight: 18, flex: 1 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.bd,
    backgroundColor: T.bar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: T.fg, fontSize: 22, lineHeight: 24 },
  stepValue: { color: T.fg, fontSize: 34, width: 64, textAlign: 'center' },
  test: { borderWidth: 1, borderColor: T.bd, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 4 },
  testText: { color: T.fg, fontSize: 16, fontWeight: '600' },
  hint: { color: T.mut, fontSize: 13, lineHeight: 18, marginTop: 4, marginHorizontal: 2 },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: T.bar,
    paddingTop: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: T.bd,
  },
  tab: { flex: 1, maxWidth: 190, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 26 },
  tabOn: { backgroundColor: T.fg },
  tabText: { fontSize: 20, letterSpacing: 0.6, textTransform: 'uppercase' },
});
