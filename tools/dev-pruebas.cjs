// Arranca el servidor de desarrollo conectado al ambiente de PRUEBAS (claves públicas de
// .env.pruebas), en vez del de producción que trae .env. Lo usan los casos fijos de la IA
// (/ai-cases): así las corridas gastan el cupo y la base de pruebas, nunca los de producción.
//
//   node tools/dev-pruebas.cjs
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, '.env.pruebas');
if (!fs.existsSync(file)) {
  console.error('Falta .env.pruebas con las claves públicas del ambiente de pruebas.');
  process.exit(1);
}
// Las variables ya definidas no las pisa el archivo .env de Expo: así manda el de pruebas.
const env = { ...process.env, EXPO_PUBLIC_APP_ENV: 'test' };
for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
console.log('== Servidor de desarrollo conectado a PRUEBAS ==');
const child = spawn('npx', ['expo', 'start', '--clear'], { cwd: root, env, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
