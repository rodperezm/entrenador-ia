export const colors = {
  bg: '#0E0F13',
  surface: '#1A1B22',
  surfaceAlt: '#272933',
  border: '#333644',
  text: '#F4F4F7',
  textMuted: '#A7AAB8',
  accent: '#FF5040', // solo para la acción principal y lo que hay que destacar
  link: '#F2A69D', // enlaces: el mismo tono, más tranquilo
  onAccent: '#1B0705', // texto sobre el rojo: el blanco no alcanza el contraste mínimo
  accentSoft: 'rgba(255, 80, 64, 0.15)',
  warning: '#FFB020',
  warningSoft: 'rgba(255, 176, 32, 0.12)',
  bodyBase: '#3B404C', // pelo y detalles de la figura
  bodyMuscle: '#565C6B', // cuerpo: se distingue del fondo de las tarjetas
  bodySecondary: '#B4635B', // músculo secundario: el rojo de la app, apagado
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 };

// Letra de la marca (la del logo y la página): solo mayúsculas y un solo grosor. Va en los títulos;
// el texto corrido, los botones y los números siguen con la letra del sistema, que se lee mejor.
export const DISPLAY_FONT = 'BebasNeue_400Regular';
// Sin alto de línea fijo: con uno ajustado, Safari en iPhone corta la parte de arriba de las letras
// en los títulos de una sola línea (las barras superiores). El alto natural de la letra no se corta.
export const display = (fontSize: number) => ({
  fontFamily: DISPLAY_FONT,
  fontWeight: '400' as const,
  fontSize,
  letterSpacing: 0.4,
});
