import { writeFileSync } from 'node:fs';
import { TERMS, TERMS_DATE_LABEL } from '@/content/terms';

// Arma el documento para el abogado con el mismo texto que muestra la app, más las preguntas
// abiertas. Uso: npx tsx tools/legal/borrador.ts

const QUESTIONS: [string, string][] = [
  [
    'Quién es el responsable',
    'El texto dice «el equipo de KETTAI, desde Santiago de Chile». Falta el nombre o razón social, RUT, domicilio y un correo de contacto. Definir si conviene operar como persona natural o constituir una sociedad antes de abrir al público o cobrar.',
  ],
  [
    'Datos de salud y consentimiento',
    'La app guarda lesiones, dolor y medidas corporales, que son datos sensibles. Hoy el consentimiento se pide con una casilla al registrarse y otra al activar el respaldo. Confirmar si eso cumple la Ley 19.628 y la nueva Ley 21.719 de protección de datos (consentimiento expreso, informado y específico), y si la casilla única de Términos debe separarse de la de datos de salud.',
  ],
  [
    'Envío de datos al extranjero',
    'Los datos se guardan en Supabase y se envían a Anthropic (inteligencia artificial) y, de forma técnica, a YouTube. Confirmar qué exige la ley chilena para la transferencia internacional y si hay que firmar o citar acuerdos de tratamiento de datos con esos proveedores.',
  ],
  [
    'Menores de edad',
    'El texto pide 18 años o autorización del representante, pero la app no lo verifica (la fecha de nacimiento es opcional). Definir si basta la declaración o si hay que bloquear a menores.',
  ],
  [
    'Límite de responsabilidad por lesiones',
    'La cláusula 11 limita la responsabilidad «en la medida en que la ley lo permita». Revisar qué parte es válida frente a la Ley 19.496 del consumidor (cláusulas abusivas) y cómo redactarla para que no se tenga por no escrita.',
  ],
  [
    'Aviso de que no es un servicio médico',
    'Confirmar que las advertencias (cláusulas 3 y 4, y las alertas de salud del registro) son suficientes, y si la app podría considerarse un dispositivo o servicio de salud sujeto a otra regulación.',
  ],
  [
    'Decisiones automatizadas con inteligencia artificial',
    'Las rutinas las generan reglas e IA sin revisión humana. Confirmar si la Ley 21.719 exige informar algo más o dar derecho a pedir revisión.',
  ],
  [
    'Planes de pago',
    'Hoy es gratis. Antes de cobrar hay que agregar: precio, renovación, forma de terminar, derecho a retracto (Ley 19.496) y boletas. La cláusula 7 solo lo anuncia.',
  ],
  [
    'Tribunal competente',
    'La cláusula 14 solo dice «ley chilena». Confirmar si conviene fijar domicilio en Santiago o dejarlo abierto, considerando que al consumidor no se le puede imponer un tribunal distinto del que le da la ley.',
  ],
  [
    'Plazo de conservación y derechos',
    'La pantalla Privacidad explica cómo descargar y borrar los datos, pero no dice cuánto tiempo se conservan ni un plazo para responder solicitudes. Los respaldos diarios de la base se guardan 30 días. Definir plazos.',
  ],
  [
    'Marca',
    'Revisar si «KETTAI» está registrada o conviene registrarla en INAPI antes de lanzar.',
  ],
  [
    'Cómo se registra la aceptación',
    'La app guarda la versión de los Términos aceptada y la fecha, en el perfil de la persona. A quienes ya tenían perfil les aparece un aviso para leer y aceptar. Confirmar si ese registro es prueba suficiente.',
  ],
];

const lines = [
  '# KETTAI · Términos y condiciones (borrador)',
  '',
  `Versión del ${TERMS_DATE_LABEL}. **Borrador para revisión de un abogado**: es el mismo texto que hoy muestra la app en la pantalla «Términos y condiciones».`,
  '',
  '## Texto',
  '',
  ...TERMS.flatMap((s) => [`### ${s.title}`, '', ...s.body.flatMap((p) => [p, '']),]),
  '## Preguntas para el abogado',
  '',
  'Puntos que el borrador deja abiertos o resuelve de forma provisoria.',
  '',
  ...QUESTIONS.flatMap(([title, body], i) => [`${i + 1}. **${title}.** ${body}`, '']),
  '## Texto relacionado',
  '',
  'La pantalla «Privacidad» de la app forma parte de los Términos y también es un borrador. Su texto está en `src/app/privacy.tsx`.',
  '',
];
writeFileSync('docs/Terminos-y-condiciones-borrador.md', lines.join('\n'));
console.log('listo', TERMS.length, 'cláusulas,', QUESTIONS.length, 'preguntas');
