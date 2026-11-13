// Arma y publica la app en un destino de ambientes.json.
//
//   node tools/publicar/publicar.cjs github              arma y publica en GitHub
//   node tools/publicar/publicar.cjs kettaiapp --solo-armar   solo deja la carpeta dist lista
//
// Qué hace: carga las claves públicas del destino, le dice a la app su dirección base, si es de
// pruebas y si avisa de una mudanza, exporta la web con la memoria temporal limpia (sin eso no
// llega el número de versión nuevo) y ajusta las direcciones fijas de los archivos públicos.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const [target, ...flags] = process.argv.slice(2);
const targets = JSON.parse(fs.readFileSync(path.join(root, 'ambientes.json'), 'utf8'));
const cfg = targets[target];
if (!cfg || target === '_') {
  console.error(`Destino desconocido. Opciones: ${Object.keys(targets).filter((k) => k !== '_').join(', ')}`);
  process.exit(1);
}
const onlyBuild = flags.includes('--solo-armar');
const ORIGINAL = { baseUrl: '/entrenador-ia', address: 'https://rodperezm.github.io/entrenador-ia/' };

// Claves públicas de Supabase del destino. Las variables ya definidas mandan sobre el archivo.
const env = { ...process.env };
const keysFile = path.join(root, cfg.claves);
if (!fs.existsSync(keysFile)) {
  console.error(`Falta el archivo de claves ${cfg.claves} para «${target}».`);
  process.exit(1);
}
for (const line of fs.readFileSync(keysFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
env.KETTAI_BASE_URL = cfg.baseUrl;
// Para probar a mano la franja o el aviso sin tocar ambientes.json: KETTAI_PAPEL y KETTAI_MUDANZA.
env.EXPO_PUBLIC_APP_ENV = (process.env.KETTAI_PAPEL || cfg.papel) === 'pruebas' ? 'test' : 'production';
env.EXPO_PUBLIC_MOVED_TO = process.env.KETTAI_MUDANZA ?? cfg.mudanza ?? '';
// El ambiente de pruebas muestra dónde está la app real, por si alguien llega ahí con un ícono antiguo.
const real = Object.entries(targets).find(([k, t]) => k !== '_' && t.papel === 'produccion');
env.EXPO_PUBLIC_PROD_URL = real ? real[1].direccion : '';
env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --max-old-space-size=2048 --max-semi-space-size=4`.trim();

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status || 1);
};

console.log(`\n== ${cfg.nombre} · ${cfg.direccion} · ${env.EXPO_PUBLIC_APP_ENV}${env.EXPO_PUBLIC_MOVED_TO ? ' · avisa mudanza' : ''} ==\n`);
run('npx', ['expo', 'export', '-p', 'web', '--max-workers', '1', '--clear']);

// Los archivos de public/ traen fija la dirección original: se ajustan a la del destino.
const dist = path.join(root, 'dist');
const base = cfg.baseUrl.replace(/\/$/, '');
for (const name of ['index.html', 'manifest.json', 'instalar-iphone.html', 'instalar-android.html']) {
  const file = path.join(dist, name);
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, 'utf8');
  text = text.split(ORIGINAL.address).join(cfg.direccion);
  text = text.split(ORIGINAL.address.replace(/^https:\/\//, '')).join(cfg.direccion.replace(/^https:\/\//, ''));
  text = text.split(`${ORIGINAL.baseUrl}/`).join(`${base}/`);
  fs.writeFileSync(file, text);
}
// Las fuentes (la letra de los títulos y los íconos) quedan en assets/node_modules, y Cloudflare no
// sube ninguna carpeta con ese nombre: la app se veía con otra letra y sin íconos. Se renombra la
// carpeta y se ajustan las referencias, igual en todos los destinos.
const modules = path.join(dist, 'assets', 'node_modules');
if (fs.existsSync(modules)) {
  fs.renameSync(modules, path.join(dist, 'assets', 'modulos'));
  const fix = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) fix(file);
      else if (/\.(js|html|json|css)$/.test(name)) {
        const text = fs.readFileSync(file, 'utf8');
        if (text.includes('assets/node_modules')) fs.writeFileSync(file, text.split('assets/node_modules').join('assets/modulos'));
      }
    }
  };
  fix(dist);
}

// Rutas internas abiertas directo (por ejemplo /day/mon) caen en esta página y la app las resuelve.
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
fs.writeFileSync(path.join(dist, '.gitignore'), '');

if (onlyBuild) {
  console.log('\nListo: dist armada, sin publicar.');
  process.exit(0);
}
if (cfg.publicar === 'gh-pages') {
  run('npx', ['gh-pages', '--nojekyll', '--dotfiles', '--add', '-d', 'dist']);
} else if (cfg.publicar.startsWith('cloudflare:')) {
  const project = cfg.publicar.split(':')[1];
  run('npx', ['--yes', 'wrangler@4', 'pages', 'deploy', 'dist', '--project-name', project, '--branch', 'main', '--commit-dirty=true']);
} else {
  console.error(`No sé publicar con «${cfg.publicar}».`);
  process.exit(1);
}
