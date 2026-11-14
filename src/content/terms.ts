// Términos y condiciones de KETTAI.
//
// BORRADOR: lo redactó el equipo para dejar la app funcionando y debe revisarlo un abogado antes
// de abrir la app al público o cobrar. Los puntos que el abogado tiene que resolver están en
// docs/Terminos-y-condiciones-borrador.md.
//
// Al cambiar el texto de forma que afecte a las personas, sube TERMS_VERSION: quienes aceptaron
// una versión anterior verán el aviso para leer y aceptar la nueva.

export const TERMS_VERSION = '2026-11-13';
export const TERMS_DATE_LABEL = '13 de noviembre de 2026';

export type TermsSection = { title: string; body: string[] };

export const TERMS: TermsSection[] = [
  {
    title: '1. Qué es KETTAI',
    body: [
      'KETTAI es una aplicación que propone rutinas de entrenamiento con kettlebell y peso corporal, para hacer en casa o en el parque, según la información que tú entregas.',
      'La aplicación es operada por el equipo de KETTAI, desde Santiago de Chile. En estos términos, «KETTAI», «nosotros» o «la app» se refieren a ese equipo y a la aplicación.',
      'Hoy KETTAI está en etapa de prueba: puede tener errores, cambiar o dejar de estar disponible.',
    ],
  },
  {
    title: '2. Aceptación',
    body: [
      'Para usar KETTAI tienes que aceptar estos términos. Si no estás de acuerdo, no uses la app.',
      'La app es para personas de 18 años o más. Si tienes menos de 18, solo puedes usarla con la autorización y bajo la supervisión de tu madre, padre o representante legal.',
    ],
  },
  {
    title: '3. No es un servicio médico',
    body: [
      'KETTAI no es un servicio de salud. No diagnostica, no trata lesiones ni enfermedades y no reemplaza la evaluación ni la indicación de un médico, kinesiólogo u otro profesional de la salud.',
      'Antes de empezar un programa de ejercicio, consulta a un profesional de la salud, sobre todo si tienes una lesión, una enfermedad, estás embarazada, tomas medicamentos, o marcaste alguna de las alertas que la app te pregunta al inicio.',
      'Si durante un ejercicio sientes dolor, mareo, falta de aire o dolor en el pecho, detente. Si el malestar no pasa, pide atención médica.',
      'Los ajustes que la app hace por lesiones o dolor buscan reducir el riesgo, pero no lo eliminan y no son una indicación médica.',
    ],
  },
  {
    title: '4. Tu responsabilidad al entrenar',
    body: [
      'El ejercicio físico, y en particular el trabajo con pesas, tiene riesgo de lesión. Tú decides entrenar y lo haces bajo tu propia responsabilidad.',
      'Te comprometes a entregar información verdadera sobre tu condición, tus lesiones y tu equipamiento, y a mantenerla al día. Las rutinas se arman con esos datos: si no son correctos, la rutina puede no ser adecuada para ti.',
      'Te corresponde entrenar en un lugar seguro y despejado, usar equipamiento en buen estado, elegir un peso que puedas controlar, calentar antes y respetar la técnica que se muestra en cada ejercicio.',
      'Si un ejercicio no te parece seguro para ti, no lo hagas: puedes marcarlo como «No puedo hacerlo» y la app lo cambia.',
    ],
  },
  {
    title: '5. Rutinas hechas con reglas e inteligencia artificial',
    body: [
      'Las rutinas se generan de forma automática, con reglas de entrenamiento y, cuando corresponde, con inteligencia artificial. Ninguna persona las revisa antes de que las recibas.',
      'Aunque aplicamos filtros de seguridad, una rutina puede contener errores o no ser adecuada para tu caso. Revísala con criterio antes de hacerla y ajústala o descártala si algo no te calza.',
      'No garantizamos resultados: bajar de peso, ganar fuerza, mejorar una lesión o cualquier otro objetivo dependen de muchos factores que la app no controla.',
    ],
  },
  {
    title: '6. Tu cuenta',
    body: [
      'Puedes crear una cuenta con tu correo para respaldar tus datos. Se entra con un código que enviamos a ese correo: no hay contraseña.',
      'La cuenta es personal. Cuida el acceso a tu correo y avísanos si crees que alguien más entró a tu cuenta.',
      'Puedes cerrar sesión o borrar tu cuenta y tu respaldo cuando quieras, desde «Cuenta y respaldo».',
    ],
  },
  {
    title: '7. Precio y planes',
    body: [
      'Durante la etapa de prueba, KETTAI es gratis. La cantidad de semanas que puedes armar con inteligencia artificial tiene un límite, que la app te informa.',
      'Más adelante podremos ofrecer planes de pago. Antes de cobrar cualquier monto te informaremos el precio, lo que incluye y sus condiciones, y solo se te cobrará si aceptas de forma expresa.',
    ],
  },
  {
    title: '8. Uso permitido',
    body: [
      'KETTAI es para tu uso personal. No puedes revenderla, usarla para dar un servicio a terceros sin nuestro permiso, ni presentarla como propia.',
      'No puedes intentar entrar a datos de otras personas, saltarte los límites de uso, sobrecargar el servicio, usarlo de forma automatizada ni copiar o extraer en masa su contenido.',
      'Si detectamos un uso que infringe estos términos o pone en riesgo el servicio, podemos limitar o suspender tu acceso.',
    ],
  },
  {
    title: '9. Contenido y propiedad intelectual',
    body: [
      'La aplicación, su diseño, sus textos, su método de entrenamiento y su marca pertenecen a KETTAI. Te damos permiso para usarlos solo dentro de la app y para tu entrenamiento personal.',
      'Los videos de los ejercicios se reproducen desde YouTube y pertenecen a sus autores. Se muestran según las condiciones de YouTube, y pueden dejar de estar disponibles.',
      'Tus datos son tuyos. Nos autorizas a usarlos para hacer funcionar la app, en la forma que explica la sección «Privacidad».',
    ],
  },
  {
    title: '10. Tus datos personales',
    body: [
      'Para armar tu rutina, la app trata datos personales, incluidos datos de salud como tus lesiones, tu dolor y tus medidas. Los tratamos con tu consentimiento y solo para darte el servicio.',
      'Algunos datos se envían a proveedores que nos prestan servicios y que pueden estar fuera de Chile: Supabase (respaldo en la nube) y Anthropic (inteligencia artificial).',
      'El detalle de qué guardamos, para qué, con quién se comparte y cómo puedes descargar o borrar tus datos está en la pantalla «Privacidad», que forma parte de estos términos.',
    ],
  },
  {
    title: '11. Límites de nuestra responsabilidad',
    body: [
      'La app se entrega «tal como está». No aseguramos que funcione sin interrupciones ni errores, ni que tus datos guardados solo en el teléfono se conserven si lo pierdes, lo cambias o borras los datos del navegador.',
      'En la medida en que la ley lo permita, KETTAI no responde por lesiones, daños o pérdidas que resulten de hacer los ejercicios, de entregar información incorrecta o incompleta, o de no seguir las advertencias de la app y de estos términos.',
      'Nada de lo anterior limita los derechos que la ley chilena reconoce a los consumidores y que no se pueden renunciar.',
    ],
  },
  {
    title: '12. Término',
    body: [
      'Puedes dejar de usar KETTAI en cualquier momento y borrar tu cuenta y tus datos.',
      'Podemos dejar de ofrecer la app o alguna de sus funciones. Si eso ocurre y tienes una cuenta, haremos lo posible por avisarte con anticipación para que puedas descargar tus datos.',
    ],
  },
  {
    title: '13. Cambios a estos términos',
    body: [
      'Podemos actualizar estos términos. Cuando el cambio sea importante, la app te avisará y te pedirá aceptarlos de nuevo. La fecha de la versión vigente aparece al inicio de esta pantalla.',
    ],
  },
  {
    title: '14. Ley aplicable',
    body: [
      'Estos términos se rigen por las leyes de la República de Chile. Cualquier diferencia se resolverá ante los tribunales que correspondan según la ley chilena.',
    ],
  },
  {
    title: '15. Contacto',
    body: [
      'Para dudas, reclamos o para ejercer tus derechos sobre tus datos, escríbenos desde el menú de la app, en «Enviar un comentario».',
    ],
  },
];
