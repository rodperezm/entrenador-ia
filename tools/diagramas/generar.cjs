// Genera docs/diagramas/KETTAI-diagramas.drawio: arquitectura, UML (casos de uso, clases, secuencia)
// y el flujo de procesos en BPMN 2.0, con la paleta y el estilo de la skill de flujos de Rodrigo.
// Uso: node tools/diagramas/generar.cjs [carpeta de salida]
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.argv[2] || path.join(ROOT, 'docs', 'diagramas');

// ---------- Paleta (skill flujo-funciones-cruzadas-bpmn) ----------
const C = {
  bg: '#F0EEE9', // hueso
  ink: '#1E2233',
  muted: '#5d6075',
  blue: '#2F6FA8',
  pool: '#C9D9EA',
  green: '#BFE6D2',
  coral: '#F4B8B2',
  gate: '#E1E9F2',
  black: '#000000',
  white: '#FFFFFF',
};
const LOGO = 'data:image/png,' + fs.readFileSync(path.join(ROOT, 'public', 'icon-192.png')).toString('base64');

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

class Page {
  constructor(name, width, height) {
    Object.assign(this, { name, width, height, cells: [], n: 2 });
  }
  id() {
    return `c${this.n++}`;
  }
  v(value, style, x, y, w, h, parent = '1') {
    const id = this.id();
    this.cells.push(
      `<mxCell id="${id}" value="${esc(value)}" style="${esc(style)}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
    return id;
  }
  e(value, style, source, target, opts = {}) {
    const id = this.id();
    const pts = (opts.points || []).map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join('');
    const sp = opts.from ? `<mxPoint x="${opts.from[0]}" y="${opts.from[1]}" as="sourcePoint"/>` : '';
    const tp = opts.to ? `<mxPoint x="${opts.to[0]}" y="${opts.to[1]}" as="targetPoint"/>` : '';
    const st = source ? ` source="${source}"` : '';
    const tg = target ? ` target="${target}"` : '';
    this.cells.push(
      `<mxCell id="${id}" value="${esc(value)}" style="${esc(style)}" edge="1" parent="1"${st}${tg}><mxGeometry relative="1" as="geometry">${sp}${tp}${pts ? `<Array as="points">${pts}</Array>` : ''}</mxGeometry></mxCell>`,
    );
    return id;
  }
  header(title, subtitle) {
    this.v('', `shape=image;image=${LOGO};imageAspect=1;aspect=fixed;`, 40, 26, 58, 58);
    this.v(title, `text;html=1;fontSize=26;fontStyle=1;fontColor=${C.ink};align=left;verticalAlign=middle;`, 112, 24, 1400, 36);
    this.v(subtitle, `text;html=1;fontSize=13;fontColor=${C.blue};align=left;verticalAlign=middle;`, 112, 60, 1400, 22);
  }
  xml() {
    return `<diagram id="${esc(this.name)}" name="${esc(this.name)}"><mxGraphModel dx="0" dy="0" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${this.width}" pageHeight="${this.height}" background="${C.bg}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${this.cells.join('')}</root></mxGraphModel></diagram>`;
  }
}

const SEQ = `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;strokeColor=${C.black};strokeWidth=1.5;fontSize=11;fontColor=${C.ink};labelBackgroundColor=${C.bg};`;
const box = (fill = C.white) =>
  `rounded=1;arcSize=10;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${C.black};fontSize=11;fontColor=${C.ink};`;
const group = `rounded=1;arcSize=3;whiteSpace=wrap;html=1;fillColor=${C.bg};strokeColor=${C.black};strokeWidth=1.5;verticalAlign=top;align=left;spacingLeft=12;spacingTop=6;fontStyle=1;fontSize=14;fontColor=${C.ink};`;

// ======================================================================
// 1. Arquitectura
// ======================================================================
function arquitectura() {
  const p = new Page('1 · Arquitectura', 1600, 780);
  p.header('KETTAI · Arquitectura', 'Componentes, ambientes y servicios · noviembre 2026 · versión 1.8.1');

  // Grupos: el teléfono queda junto a Supabase para que las flechas vayan derechas.
  p.v('Personas', group, 40, 120, 210, 610);
  p.v('Teléfono de la persona (navegador o app instalada)', group, 290, 120, 440, 300);
  p.v('Sitio y panel', group, 290, 450, 440, 280);
  p.v('Supabase · un proyecto de producción y otro de pruebas', group, 790, 120, 440, 400);
  p.v('Publicación', group, 790, 550, 440, 180);
  p.v('Servicios externos', group, 1290, 120, 270, 330);
  p.v('Respaldo', group, 1290, 480, 270, 250);

  const actor = `shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fillColor=${C.white};strokeColor=${C.black};fontSize=12;fontColor=${C.ink};fontStyle=1;`;
  const persona = p.v('Persona<br><span style="font-weight:normal">iPhone · Android · iPad</span>', actor, 128, 158, 34, 64);
  const admin = p.v('Administrador<br><span style="font-weight:normal">(Rodrigo)</span>', actor, 128, 488, 34, 64);

  const app = p.v('<b>App KETTAI</b><br>Expo SDK 58 · React Native Web · Expo Router', box(C.green), 310, 165, 400, 52);
  p.v('<b>Pantallas</b><br>Hoy · Semana · Ejercicios<br>Cuerpo · HIIT · Progreso', box(), 310, 240, 190, 74);
  p.v('<b>Reglas de entrenamiento</b><br>generador · progresión · ciclos<br>tiempo · rutinas rápidas', box(), 520, 240, 190, 74);
  const local = p.v('<b>Almacenamiento del teléfono</b><br>perfil · semana · historial · medidas', box(), 310, 338, 400, 52);

  const sitio = p.v('<b>Sitio www.kettaiapp.com y Panel</b><br>página pública · /Panel para administrar', box(C.green), 310, 490, 400, 56);
  const guia = p.v('<b>Guía de instalación</b><br>app.kettaiapp.com/instalar · iPhone o Android', box(), 310, 575, 400, 52);
  p.v('<b>Comentarios</b><br>llegan a la pestaña Reportes del panel', box(), 310, 655, 400, 52);

  const edge = p.v('<b>Función generate-plan</b><br>arma la semana con IA · reserva y libera el cupo', box(C.gate), 810, 165, 400, 52);
  const auth = p.v('<b>Autenticación</b><br>código de 8 dígitos por correo, sin contraseña', box(C.gate), 810, 240, 400, 52);
  const base = p.v(
    '<b>Base de datos Postgres · seguridad por fila</b><br>user_items (respaldo de cada persona)<br>approved_accounts · ai_plans · ai_generations<br>app_settings · app_reports · onboarding_steps · admins',
    box(C.gate),
    810,
    315,
    400,
    100,
  );
  const fns = p.v('<b>Funciones de la base</b><br>account_status · reserve_ai_generation · admin_*', box(C.gate), 810, 440, 400, 56);

  p.v('<b>Cloudflare Pages</b><br>app.kettaiapp.com · producción', box(), 810, 590, 195, 56);
  p.v('<b>Cloudflare Pages</b><br>www.kettaiapp.com · sitio y panel', box(), 1015, 590, 195, 56);
  p.v('<b>GitHub Pages</b><br>dirección de pruebas', box(), 810, 660, 195, 56);
  p.v('<b>GitHub</b><br>código y versiones · ping diario a pruebas', box(), 1015, 660, 195, 56);

  const claude = p.v('<b>Anthropic · Claude Sonnet 5.5</b><br>propone la semana', box(C.coral), 1310, 165, 230, 52);
  const gmail = p.v('<b>Gmail (SMTP)</b><br>envía los códigos de acceso', box(C.coral), 1310, 240, 230, 52);
  p.v('<b>YouTube</b><br>video de cada ejercicio, dentro de la app', box(C.coral), 1310, 330, 230, 52);
  const casa = p.v('<b>Servidor casero</b><br>copia diaria 04:30 · 30 días', box(), 1310, 525, 230, 56);
  const drive = p.v('<b>Google Drive</b><br>segunda copia, 10:00', box(), 1310, 630, 230, 56);

  const L = 'exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;';
  p.e('usa', SEQ + 'exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;', persona, app);
  p.e('administra', SEQ + L, admin, sitio);
  p.e('arma la semana con IA', SEQ + L, app, edge);
  p.e('entra con su correo', SEQ + 'exitX=1;exitY=0.85;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;', app, auth, { points: [[755, 209], [755, 266]] });
  p.e('respaldo y acceso', SEQ + L, local, base);
  p.e('aprobar · métricas · reportes', SEQ + L, sitio, fns, { points: [[765, 518], [765, 468]] });
  p.e('', SEQ + 'endArrow=none;dashed=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;', sitio, guia);
  p.e('instrucciones y datos', SEQ + 'exitX=1;exitY=0.3;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;', edge, claude, { points: [[1260, 181], [1260, 191]] });
  p.e('envía el código', SEQ + L, auth, gmail);
  p.e('copia diaria', SEQ + L, base, casa, { points: [[1255, 365], [1255, 553]] });
  p.e('', SEQ + 'exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;', casa, drive);
  return p;
}

// ======================================================================
// 2. UML · Casos de uso
// ======================================================================
function casosDeUso() {
  const p = new Page('2 · UML · Casos de uso', 1500, 940);
  p.header('KETTAI · Casos de uso (UML)', 'Qué hace cada actor con la app y con el panel');
  p.v('Sistema KETTAI', `rounded=0;whiteSpace=wrap;html=1;fillColor=${C.bg};strokeColor=${C.black};strokeWidth=1.5;verticalAlign=top;align=center;spacingTop=8;fontStyle=1;fontSize=15;fontColor=${C.ink};`, 290, 120, 900, 790);

  const uc = (label, x, y, fill = C.white) =>
    p.v(label, `ellipse;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${C.black};fontSize=12;fontColor=${C.ink};`, x, y, 230, 54);
  const actor = (label, x, y) =>
    p.v(label, `shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fillColor=${C.white};strokeColor=${C.black};fontSize=13;fontStyle=1;fontColor=${C.ink};`, x, y, 36, 70);
  const assoc = `endArrow=none;html=1;strokeColor=${C.black};strokeWidth=1.2;`;
  const dep = (word) => [`«${word}»`, `endArrow=open;endFill=0;dashed=1;html=1;strokeColor=${C.black};fontSize=11;fontColor=${C.ink};labelBackgroundColor=${C.bg};`];

  const persona = actor('Persona', 120, 460);
  const admin = actor('Administrador', 1300, 240);
  const ia = actor('Claude (IA)', 1300, 640);

  const col1 = 330;
  const rows = ['Instalar la app', 'Crear cuenta con su correo', 'Completar el perfil', 'Armar la semana con IA<br>(cada lunes)', 'Entrenar la sesión guiada', 'Hacer una rutina rápida', 'Registrar peso y medidas', 'Ver su progreso', 'Enviar un comentario', 'Usar el temporizador HIIT'];
  const ids = rows.map((r, i) => uc(r, col1, 165 + 72 * i, i === 3 || i === 4 ? C.green : C.white));
  // Las líneas llegan a la punta izquierda de cada óvalo: así no cruzan los de abajo.
  ids.forEach((id) => p.e('', assoc + 'entryX=0;entryY=0.5;entryDx=0;entryDy=0;', persona, id));

  const reglas = uc('Armar la semana con reglas', 640, 300);
  const cupo = uc('Reservar cupo de IA', 640, 380);
  const propuesta = uc('Generar la propuesta<br>con Claude', 640, 460, C.coral);
  const registrar = uc('Marcar esfuerzo, molestias<br>y cómo terminó', 640, 560);
  p.e(...dep('extend'), reglas, ids[3]);
  p.e(...dep('include'), ids[3], cupo);
  p.e(...dep('include'), ids[3], propuesta);
  p.e(...dep('include'), ids[4], registrar);
  p.e('', assoc, ia, propuesta);

  const adm = ['Aprobar cuentas nuevas', 'Ver métricas y embudo', 'Leer reportes y comentarios', 'Configurar planes y cupos'].map((r, i) =>
    uc(r, 930, 165 + 80 * i, C.gate),
  );
  adm.forEach((id) => p.e('', assoc + 'entryX=1;entryY=0.5;entryDx=0;entryDy=0;', admin, id));
  p.v('«extend»: si la IA no responde, no hay cupo o es la semana de preparación.', `text;html=1;fontSize=11;fontColor=${C.muted};align=left;`, 620, 660, 300, 40);
  return p;
}

// ======================================================================
// 3. UML · Clases (modelo de datos de la app)
// ======================================================================
function clases() {
  const p = new Page('3 · UML · Clases', 1600, 1080);
  p.header('KETTAI · Modelo de datos (UML de clases)', 'Lo que guarda la app en el teléfono; en la nube se respalda en user_items');
  const cls = (name, attrs, x, y, w, head) => {
    const h = 30 + attrs.length * 17 + 10;
    const id = p.v(name, `swimlane;fontStyle=1;align=center;startSize=30;html=1;whiteSpace=wrap;fillColor=${head};swimlaneFillColor=${C.white};strokeColor=${C.black};fontSize=13;fontColor=${C.ink};collapsible=0;`, x, y, w, h);
    p.v(attrs.join('<br>'), `text;html=1;align=left;verticalAlign=top;spacingLeft=8;spacingTop=4;whiteSpace=wrap;fontSize=11;fontColor=${C.ink};`, 0, 30, w, h - 30, id);
    return id;
  };
  const rel = (label, a, b, opts = {}) =>
    p.e(label, `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=${opts.arrow || 'open'};endFill=0;startArrow=${opts.start || 'none'};startFill=${opts.startFill ?? 0};strokeColor=${C.black};strokeWidth=1.2;fontSize=11;fontColor=${C.ink};labelBackgroundColor=${C.bg};${opts.dashed ? 'dashed=1;' : ''}`, a, b, opts);
  const W = 220;
  const X = [40, 300, 560, 820, 1080, 1340];

  const perfil = cls('Perfil', ['nombre, sexo, nacimiento, altura', 'condición física (1 a 3)', 'experiencia con kettlebell', 'equipo en casa y en el parque', 'pesas que tiene (kg)', 'alertas de salud', 'términos aceptados'], X[0], 130, W, C.green);
  const cond = cls('CondiciónMédica', ['nombre', 'restricciones sugeridas', 'ejercicios de cuidado'], X[1], 130, W, C.green);
  const restr = cls('Restricción', ['id (p. ej. saltos, impacto)', 'nombre'], X[2], 130, W, C.green);
  const ejer = cls('Ejercicio', ['nombre', 'patrón de movimiento', 'bloques donde va', 'dificultad 1 a 5', 'equipo necesario', 'prescripción (series, reps, s)', 'músculos · video'], X[4], 130, W, C.pool);
  const rutina = cls('RutinaRápida', ['título · zona', 'cuándo conviene', 'ejercicios (fijos)'], X[5], 130, W, C.pool);

  const config = cls('ConfigSemana', ['días de fuerza', 'actualizada el'], X[0], 440, W, C.gate);
  const plan = cls('PlanSemana', ['semana (lunes)', 'armada por: IA o reglas', 'resumen de la IA'], X[1], 440, W, C.gate);
  const dia = cls('PlanDía', ['día · lugar', 'ajustado al tiempo'], X[2], 440, W, C.gate);
  const bloque = cls('Bloque', ['tipo: calentamiento, lesión,', 'fuerza o elongación'], X[3], 440, W, C.gate);
  const slot = cls('Slot', ['series · reps · segundos', 'peso (kg) · descanso', 'rol A, B o C', 'por qué (texto)'], X[4], 440, W, C.gate);

  const diaCfg = cls('DíaConfig', ['día · activo', 'casa o parque', 'minutos disponibles', 'partes que incluye'], X[0], 720, W, C.gate);
  const sesion = cls('SesiónEntrenamiento', ['inicio · fin · completa', 'cómo llegó (energía, dolor)', 'cómo terminó', 'AMRAP · no pudo · modificado'], X[1], 720, W, C.coral);
  const serie = cls('RegistroSerie', ['reps hechas · peso', 'esfuerzo RPE 1 a 10', 'molestia 0 a 3 · lado', 'técnica confirmada'], X[2], 720, W, C.coral);
  const cinta = cls('RegistroCinta', ['fecha · peso', 'tórax · cintura', 'abdomen · cadera'], X[3], 720, W, C.coral);
  const pliegues = cls('RegistroPliegues', ['fecha · sexo', 'pliegues (hasta 3 tomas)'], X[4], 720, W, C.coral);
  const ciclo = cls('CicloInfo (calculado)', ['bloque · semana 1 a 4', 'fase · foco', 'etapa con kettlebell 1 a 6'], X[5], 720, W, C.white);

  rel('tiene  0..*', perfil, cond, { start: 'diamondThin', startFill: 1, arrow: 'none' });
  rel('sugiere  1..*', cond, restr);
  rel('evita', ejer, restr, { points: [[1190, 110], [670, 110]] });
  rel('usa', rutina, ejer);
  rel('define', perfil, config);
  rel('se arma con', config, plan);
  rel('1..7', plan, dia, { start: 'diamondThin', startFill: 1, arrow: 'none' });
  rel('1..4', dia, bloque, { start: 'diamondThin', startFill: 1, arrow: 'none' });
  rel('1..*', bloque, slot, { start: 'diamondThin', startFill: 1, arrow: 'none' });
  rel('ejercicio', slot, ejer);
  rel('1..7', config, diaCfg, { start: 'diamondThin', startFill: 1, arrow: 'none' });
  rel('1..*', sesion, serie, { start: 'diamondThin', startFill: 1, arrow: 'none' });
  // Por el pasillo entre Bloque y Slot, hasta el costado izquierdo de Ejercicio.
  p.e('ejercicio', `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=open;endFill=0;strokeColor=${C.black};strokeWidth=1.2;fontSize=11;fontColor=${C.ink};labelBackgroundColor=${C.bg};exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;`, serie, ejer, { points: [[670, 690], [1060, 690], [1060, 210]] });
  rel('se calcula del historial', ciclo, sesion, { dashed: true, points: [[1450, 1000], [410, 1000]] });
  p.e('ajusta la próxima carga', `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=open;endFill=0;dashed=1;strokeColor=${C.black};strokeWidth=1.2;fontSize=11;fontColor=${C.ink};labelBackgroundColor=${C.bg};exitX=0.85;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;`, serie, slot, { points: [[747, 665], [1190, 665]] });
  return p;
}

// ======================================================================
// 4. UML · Secuencia: armar la semana con IA
// ======================================================================
function secuencia() {
  const p = new Page('4 · UML · Secuencia', 1640, 960);
  p.header('KETTAI · Armar la semana con IA (UML de secuencia)', 'Qué pasa entre que la persona toca el botón el lunes y ve su semana');
  const names = ['Persona', 'App KETTAI', 'Reglas de la app', 'Supabase<br>(cupo)', 'Función<br>generate-plan', 'Claude<br>(Anthropic)'];
  const fills = [C.white, C.green, C.green, C.gate, C.gate, C.coral];
  const X = names.map((_, i) => 40 + 220 * i);
  const cx = X.map((x) => x + 80);
  names.forEach((n, i) =>
    p.v(n, `shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=0;collapsible=0;recursiveResize=0;outlineConnect=0;size=48;fillColor=${fills[i]};strokeColor=${C.black};fontSize=12;fontStyle=1;fontColor=${C.ink};`, X[i], 120, 160, 800),
  );
  const call = `html=1;endArrow=block;endFill=1;strokeColor=${C.black};strokeWidth=1.3;fontSize=11;fontColor=${C.ink};labelBackgroundColor=${C.bg};verticalAlign=bottom;`;
  const ret = `html=1;endArrow=open;endFill=0;dashed=1;strokeColor=${C.black};strokeWidth=1.2;fontSize=11;fontColor=${C.ink};labelBackgroundColor=${C.bg};verticalAlign=bottom;`;
  const msg = (label, a, b, y, back = false) => p.e(label, back ? ret : call, null, null, { from: [cx[a], y], to: [cx[b], y] });

  msg('1. Toca «Armar mi semana con IA» (lunes)', 0, 1, 210);
  msg('2. Pide la semana: perfil, días, historial resumido', 1, 4, 250);
  msg('3. reserve_ai_generation()', 4, 3, 290);
  msg('4. ok · sin cupo · falta aprobación', 3, 4, 330, true);

  const frame = `shape=umlFrame;whiteSpace=wrap;html=1;width=54;height=26;boundedLbl=1;verticalAlign=top;align=left;spacingLeft=8;fillColor=none;strokeColor=${C.black};strokeWidth=1.3;fontStyle=1;fontSize=12;fontColor=${C.ink};`;
  p.v('alt', frame, 250, 355, 1110, 420);
  const guard = `text;html=1;fontSize=11;fontStyle=2;fontColor=${C.ink};align=left;`;
  p.v('[sin cupo o falta aprobación]', guard, 310, 357, 260, 22);
  msg('5. Aviso: no hay cupo', 4, 1, 400, true);
  msg('6. Arma la semana con reglas', 1, 2, 435);
  p.e('', `endArrow=none;dashed=1;html=1;strokeColor=${C.black};`, null, null, { from: [250, 465], to: [1360, 465] });
  p.v('[hay cupo]', guard, 310, 467, 200, 22);
  msg('7. Instrucciones + datos de la persona', 4, 5, 510);
  msg('8. Señal cada 10 s (mantiene la conexión)', 4, 1, 550, true);
  msg('9. Semana propuesta', 5, 4, 590, true);
  msg('10. Plan de la semana', 4, 1, 630, true);
  msg('11. Revisa y corrige lo que no puede quedar a criterio de la IA', 1, 2, 680);
  msg('12. Semana revisada', 2, 1, 720, true);
  msg('13. «Tu semana está lista»', 1, 0, 820, true);

  p.v(
    '<b>Si Claude falla</b> o tarda demasiado: la función libera el cupo y la app arma la semana con las reglas, con un aviso para volver a intentarlo.',
    `shape=note;size=14;whiteSpace=wrap;html=1;fillColor=${C.coral};strokeColor=${C.black};fontSize=11;fontColor=${C.ink};align=left;spacingLeft=8;spacingRight=8;`,
    1390,
    480,
    220,
    110,
  );
  p.v(
    '<b>Cupo</b>: se reserva antes de llamar a la IA y se devuelve si falla. Cada cuenta tiene un tope por semana.',
    `shape=note;size=14;whiteSpace=wrap;html=1;fillColor=${C.gate};strokeColor=${C.black};fontSize=11;fontColor=${C.ink};align=left;spacingLeft=8;spacingRight=8;`,
    1390,
    250,
    220,
    96,
  );
  return p;
}

// ======================================================================
// 5. BPMN · Flujo de funciones cruzadas
// ======================================================================
function bpmn() {
  const lanes = [
    { name: 'Persona', h: 160 },
    { name: 'App KETTAI', h: 210 },
    { name: 'Supabase e IA', h: 160 },
    { name: 'Administrador', h: 190 },
  ];
  const x0 = 40;
  const y0 = 104;
  const steps = 24;
  const W = 120 + 140 * steps;
  const H = lanes.reduce((n, l) => n + l.h, 0);
  const p = new Page('5 · BPMN · Flujo de procesos', x0 + 64 + W + 40, y0 + H + 40);
  p.header('KETTAI · De la invitación a la semana de entrenamiento', 'Flujo de funciones cruzadas · BPMN 2.0 · noviembre 2026');

  // Pool y carriles
  p.v('KETTAI · Prueba con amigos', `rounded=0;whiteSpace=wrap;html=1;horizontal=0;fillColor=${C.pool};strokeColor=${C.black};fontSize=15;fontStyle=1;fontColor=${C.ink};`, x0, y0, 34, H);
  let y = y0;
  const cy = {};
  const top = {};
  lanes.forEach((l) => {
    p.v(l.name, `rounded=0;whiteSpace=wrap;html=1;horizontal=0;fillColor=${C.bg};strokeColor=${C.black};fontSize=13;fontStyle=1;fontColor=${C.ink};`, x0 + 34, y, 30, l.h);
    p.v('', `rounded=0;whiteSpace=wrap;html=1;fillColor=${C.bg};strokeColor=${C.black};`, x0 + 64, y, W, l.h);
    cy[l.name] = y + l.h / 2;
    top[l.name] = y;
    y += l.h;
  });
  const P = 'Persona';
  const K = 'App KETTAI';
  const S = 'Supabase e IA';
  const A = 'Administrador';
  const X = (i) => x0 + 64 + 70 + 140 * i;

  const ev = (fill, symbol, w) =>
    `shape=mxgraph.bpmn.event;html=1;perimeter=ellipsePerimeter;outlineConnect=0;aspect=fixed;outline=standard;symbol=${symbol};fillColor=${fill};strokeColor=${C.black};fontSize=11;fontColor=${C.ink};` +
    (w === 56 ? 'verticalLabelPosition=middle;verticalAlign=middle;fontStyle=1;' : 'verticalLabelPosition=bottom;verticalAlign=top;labelBackgroundColor=none;');
  const startMain = (i, lane, name) => {
    const id = p.v('Inicio', ev(C.green, 'general', 56), X(i) - 28, cy[lane] - 28, 56, 56);
    p.v(name, `text;html=1;align=center;verticalAlign=top;fontSize=11;fontColor=${C.ink};whiteSpace=wrap;`, X(i) - 60, cy[lane] + 30, 120, 34);
    return id;
  };
  const endMain = (i, lane, name) => {
    const id = p.v('Fin', ev(C.coral, 'general', 56), X(i) - 28, cy[lane] - 28, 56, 56);
    p.v(name, `text;html=1;align=center;verticalAlign=top;fontSize=11;fontColor=${C.ink};whiteSpace=wrap;`, X(i) - 70, cy[lane] + 30, 140, 46);
    return id;
  };
  const small = (i, lane, label, fill, symbol, dy = 0, side = '') => p.v(label, ev(fill, symbol, 36) + side, X(i) - 18, cy[lane] - 18 + dy, 36, 36);
const RIGHT = 'labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;spacingLeft=4;';
  const task = (i, lane, label, marker, dy = 0) =>
    p.v(label, `shape=mxgraph.bpmn.task2;rectStyle=rounded;size=14;taskMarker=${marker};html=1;whiteSpace=wrap;fontSize=11;spacingTop=12;fillColor=${C.white};strokeColor=${C.black};fontColor=${C.ink};`, X(i) - 59, cy[lane] - 31 + dy, 118, 62);
  const gate = (i, lane, q) =>
    p.v(q, `shape=mxgraph.bpmn.gateway2;html=1;gwType=exclusive;symbol=none;outline=none;fillColor=${C.gate};strokeColor=${C.black};perimeter=rhombusPerimeter;labelPosition=left;verticalLabelPosition=top;align=right;verticalAlign=bottom;fontSize=11;fontColor=${C.ink};labelBackgroundColor=none;whiteSpace=wrap;`, X(i) - 25, cy[lane] - 25, 50, 50);
  const f = (a, b, label = '', extra = '', points) => p.e(label, SEQ + extra, a, b, { points });
  const msgFlow = (a, b, label = '') =>
    p.e(label, `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;dashed=1;dashPattern=8 6;startArrow=oval;startFill=0;endArrow=block;endFill=0;strokeColor=${C.black};strokeWidth=1.5;fontSize=11;fontColor=${C.ink};labelBackgroundColor=${C.bg};`, a, b);

  const s0 = startMain(0, P, 'Invitación<br>por WhatsApp');
  const t1 = task(1, P, 'Abrir la guía e instalar la app', 'user');
  const t2 = task(2, P, 'Crear cuenta con su correo', 'user');
  const t3 = task(3, S, 'Enviar código de 8 dígitos', 'send');
  const t4 = task(4, P, 'Escribir el código', 'user');
  const t5 = task(5, S, 'Registrar la cuenta en espera', 'service');
  const t6 = task(6, A, 'Revisar pendientes en el panel', 'user');
  const g7 = gate(7, A, '¿Aprueba la cuenta?');
  const t8 = task(8, A, 'Aprobar la cuenta', 'user', -48);
  const e8 = small(8, A, 'Cuenta sigue<br>en espera', C.coral, 'general', 52, RIGHT);
  const t9 = task(9, P, 'Completar el perfil', 'user');
  const t10 = task(10, K, 'Armar días de preparación con reglas', 'script');
  const tm = small(11, K, 'Lunes 00:01', C.green, 'timer');
  const t12 = task(12, P, 'Tocar «Armar mi semana con IA»', 'user');
  const t13 = task(13, S, 'Reservar cupo y pedir la semana a Claude', 'service');
  const g14 = gate(14, K, '¿Respondió la IA?');
  const t15a = task(15, K, 'Revisar y corregir con reglas', 'script', -56);
  const t15b = task(15, K, 'Armar la semana con reglas', 'script', 56);
  const t16 = task(16, P, 'Entrenar la sesión guiada', 'user');
  const t17 = task(17, P, 'Marcar esfuerzo, molestias y cómo terminó', 'user');
  const t18 = task(18, K, 'Ajustar la próxima carga y guardar respaldo', 'script');
  const g19 = gate(19, K, '¿Quedan días esta semana?');
  const end = endMain(20, K, 'Semana cerrada: el lunes se arma la siguiente');
  // Comentarios: flujo aparte, cuando la persona quiera.
  const sc = small(21, P, 'Cuando quiera', C.green, 'general', 0);
  const tc = task(22, P, 'Enviar un comentario', 'send');
  const ec = small(23, P, 'Comentario enviado', C.coral, 'general', 0);
  const tr = task(22, A, 'Leer reportes y comentarios en el panel', 'receive');
  const er = small(23, A, 'Comentario leído', C.coral, 'general', 0);

  f(s0, t1);
  f(t1, t2);
  f(t2, t3);
  f(t3, t4);
  f(t4, t5);
  f(t5, t6);
  f(t6, g7);
  f(g7, t8, 'Sí', 'exitX=0.5;exitY=0;exitDx=0;exitDy=0;');
  f(g7, e8, 'No', 'exitX=0.5;exitY=1;exitDx=0;exitDy=0;');
  f(t8, t9);
  f(t9, t10);
  f(t10, tm);
  f(tm, t12);
  f(t12, t13);
  f(t13, g14);
  f(g14, t15a, 'Sí', 'exitX=0.5;exitY=0;exitDx=0;exitDy=0;');
  f(g14, t15b, 'No', 'exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;');
  f(t15a, t16, '', 'entryX=0.25;entryY=1;entryDx=0;entryDy=0;');
  f(t15b, t16, '', 'exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0.75;entryY=1;entryDx=0;entryDy=0;', [[X(16) + 30, cy[K] + 56]]);
  f(t16, t17);
  f(t17, t18);
  f(t18, g19);
  // La vuelta pasa por arriba del carril Persona: no cruza las flechas que llegan desde abajo.
  f(g19, t16, 'Sí', 'exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;', [[X(19), top[P] + 16], [X(16), top[P] + 16]]);
  f(g19, end, 'No');
  f(sc, tc);
  f(tc, ec);
  msgFlow(tc, tr);
  f(tr, er);

  // Marco grueso sobre todo el pool
  p.v('', `rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=${C.black};strokeWidth=4;pointerEvents=0;`, x0, y0, 64 + W, H);
  return p;
}

// ---------- Archivo ----------
const pages = [arquitectura(), casosDeUso(), clases(), secuencia(), bpmn()];
const mxfile = (list) => `<mxfile host="app.diagrams.net" agent="KETTAI" version="24.0.0">${list.map((p) => p.xml()).join('')}</mxfile>`;
const check = (xml) => {
  const errors = [];
  new DOMParser({ onError: (level, msg) => level !== 'warning' && errors.push(msg) }).parseFromString(xml, 'text/xml');
  if (errors.length) throw new Error('XML inválido: ' + errors.join(' | '));
};
const all = mxfile(pages);
check(all);
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'KETTAI-diagramas.drawio');
if (fs.existsSync(file)) fs.copyFileSync(file, file + '.respaldo');
fs.writeFileSync(file, all);
// Una página por archivo, para revisar cada una en el visor.
pages.forEach((p, i) => {
  const one = mxfile([p]);
  check(one);
  fs.writeFileSync(path.join(OUT, `.pagina-${i + 1}.drawio`), one);
});
console.log('ok', file, pages.map((p) => p.name).join(' | '));
