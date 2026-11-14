import { StyleSheet, Text, View } from 'react-native';
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter';
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

// Dos colores, para que se lea de un vistazo: lo principal en el rojo de la app y lo secundario
// en un tono suave del mismo color. Lo que no trabaja queda en el gris del cuerpo.
const PRIMARY = colors.accent;
const SECONDARY = colors.bodySecondary;

// Todas las zonas de la figura. La librería trae cada una con su propio gris: se pintan todas con
// el tono del cuerpo para que la silueta se distinga del fondo y la cabeza no llame la atención.
const ALL_SLUGS: Slug[] = [
  'abs',
  'adductors',
  'ankles',
  'biceps',
  'calves',
  'chest',
  'deltoids',
  'feet',
  'forearm',
  'gluteal',
  'hamstring',
  'hands',
  'head',
  'knees',
  'lower-back',
  'neck',
  'obliques',
  'quadriceps',
  'tibialis',
  'trapezius',
  'triceps',
  'upper-back',
];

// Zonas que se ven sobre todo de espalda; los deltoides y el trapecio se ven por ambos lados.
const BACK: Slug[] = ['hamstring', 'gluteal', 'upper-back', 'lower-back', 'triceps', 'calves'];
const BOTH: Slug[] = ['deltoids', 'trapezius'];

// El lado donde más se ve lo que trabaja el ejercicio: para mostrar una sola figura, más grande.
export function bestSide(primary: MuscleActivation[], secondary: MuscleActivation[] = []): View2D {
  let front = 0;
  let back = 0;
  const count = (list: MuscleActivation[], weight: number) =>
    list.forEach((m) => {
      const slug = MUSCLE_TO_SLUG[m.muscle];
      if (!slug || BOTH.includes(slug)) return;
      if (BACK.includes(slug)) back += weight * m.intensity;
      else front += weight * m.intensity;
    });
  count(primary, 1);
  count(secondary, 0.4);
  return back > front ? 'back' : 'front';
}

type Props = {
  primary: MuscleActivation[];
  secondary?: MuscleActivation[];
  views?: View2D[];
  height?: number;
  showLabels?: boolean;
  /** Por defecto, el cuerpo según el perfil. */
  gender?: 'male' | 'female';
};

export function BodyMap({
  primary,
  secondary = [],
  views = ['front', 'back'],
  height = 260,
  showLabels = false,
  gender: forcedGender,
}: Props) {
  const { profile } = useProfile();
  const gender = forcedGender ?? (profile?.sex === 'female' ? 'female' : 'male');

  // Color por zona: si una zona junta un músculo principal y uno secundario, manda el principal.
  const bySlug = new Map<Slug, string>();
  const paint = (list: MuscleActivation[], color: string) =>
    list.forEach((m) => {
      const slug = MUSCLE_TO_SLUG[m.muscle];
      if (slug) bySlug.set(slug, color);
    });
  paint(secondary, SECONDARY);
  paint(primary, PRIMARY);
  const data: ExtendedBodyPart[] = [
    ...ALL_SLUGS.map((slug) => ({ slug, color: bySlug.get(slug) ?? colors.bodyMuscle })),
    { slug: 'hair' as Slug, color: colors.bodyBase },
  ];
  const hasSecondary = [...bySlug.values()].includes(SECONDARY);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {views.map((side) => (
          <View key={side} style={styles.col}>
            <Body
              data={data}
              side={side}
              gender={gender}
              scale={height / 400}
              border="none"
              defaultFill={colors.bodyMuscle}
            />
            {showLabels && <Text style={styles.label}>{side === 'front' ? 'Frente' : 'Espalda'}</Text>}
          </View>
        ))}
      </View>
      {showLabels && bySlug.size > 0 && (
        <View style={styles.legend}>
          <View style={[styles.swatch, { backgroundColor: PRIMARY }]} />
          <Text style={styles.label}>Principal</Text>
          {hasSecondary && <View style={[styles.swatch, { backgroundColor: SECONDARY, marginLeft: 12 }]} />}
          {hasSecondary && <Text style={styles.label}>Secundario</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  col: { alignItems: 'center' },
  label: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});
