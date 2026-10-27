import { StyleSheet, Text, View } from 'react-native';
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter';
import { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { MuscleId } from '@/domain/catalog';
import type { MuscleActivation } from '@/domain/schema';
import { useProfile } from '@/state/profile';
import { colors } from '@/theme';

// Mapa muscular anatómico (frente / espalda, cuerpo de hombre o mujer según el
// perfil), con la librería abierta react-native-body-highlighter (licencia MIT).
// Nuestros 20 músculos se traducen a sus zonas; algunas agrupan varios de los
// nuestros (los tres haces del deltoides, glúteo mayor y medio, dorsal y romboides).

type View2D = 'front' | 'back';

const MUSCLE_TO_SLUG: Record<MuscleId, Slug | null> = {
  quadriceps: 'quadriceps',
  hamstrings: 'hamstring',
  gluteus_maximus: 'gluteal',
  gluteus_medius: 'gluteal',
  adductors: 'adductors',
  hip_flexors: null, // la librería no tiene esta zona
  calves: 'calves',
  pectoralis_major: 'chest',
  latissimus_dorsi: 'upper-back',
  trapezius: 'trapezius',
  rhomboids: 'upper-back',
  deltoid_anterior: 'deltoids',
  deltoid_lateral: 'deltoids',
  deltoid_posterior: 'deltoids',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearm',
  rectus_abdominis: 'abs',
  obliques: 'obliques',
  erector_spinae: 'lower-back',
};

// De menos a más intenso (índice 1, 2 y 3 de la librería).
const HEAT = ['#7A3B39', '#C2473D', '#FF4D3D'];
const level = (v: number) => (v >= 0.75 ? 3 : v >= 0.45 ? 2 : 1);

type Props = {
  primary: MuscleActivation[];
  secondary?: MuscleActivation[];
  views?: View2D[];
  height?: number;
  showLabels?: boolean;
};

export function BodyMap({
  primary,
  secondary = [],
  views = ['front', 'back'],
  height = 260,
  showLabels = false,
}: Props) {
  const { profile } = useProfile();
  const gender = profile?.sex === 'female' ? 'female' : 'male';

  // Intensidad por zona: los secundarios cuentan menos; se queda la mayor.
  const bySlug = new Map<Slug, number>();
  const add = (m: MuscleActivation, factor: number) => {
    const slug = MUSCLE_TO_SLUG[m.muscle];
    if (slug) bySlug.set(slug, Math.max(bySlug.get(slug) ?? 0, m.intensity * factor));
  };
  secondary.forEach((m) => add(m, 0.6));
  primary.forEach((m) => add(m, 1));
  const data: ExtendedBodyPart[] = [...bySlug].map(([slug, v]) => ({ slug, intensity: level(v) }));

  return (
    <View style={styles.row}>
      {views.map((side) => (
        <View key={side} style={styles.col}>
          <Body
            data={data}
            side={side}
            gender={gender}
            scale={height / 400}
            colors={HEAT}
            border="none"
            defaultFill={colors.bodyMuscle}
          />
          {showLabels && <Text style={styles.label}>{side === 'front' ? 'Frente' : 'Espalda'}</Text>}
        </View>
      ))}
    </View>
  );
}

// Silueta simple usada en la guía de medición (para marcar dónde medir).
export function Silhouette() {
  const c = colors.bodyBase;
  return (
    <G>
      <Circle cx={100} cy={33} r={21} fill={c} />
      <Rect x={91} y={50} width={18} height={16} fill={c} />
      <Path d="M 60 70 Q 100 58 140 70 L 152 92 L 132 200 L 68 200 L 48 92 Z" fill={c} />
      <Rect x={38} y={80} width={22} height={128} rx={11} fill={c} />
      <Rect x={140} y={80} width={22} height={128} rx={11} fill={c} />
      <Circle cx={49} cy={214} r={9} fill={c} />
      <Circle cx={151} cy={214} r={9} fill={c} />
      <Rect x={67} y={192} width={31} height={212} rx={14} fill={c} />
      <Rect x={102} y={192} width={31} height={212} rx={14} fill={c} />
      <Ellipse cx={82} cy={410} rx={14} ry={6} fill={c} />
      <Ellipse cx={118} cy={410} rx={14} ry={6} fill={c} />
    </G>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  col: { alignItems: 'center' },
  label: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
});
