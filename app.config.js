// Parte de app.json y cambia solo lo que depende de dónde se publica la app.
// La dirección base la entrega tools/publicar/publicar.cjs según el destino (ambientes.json):
// en GitHub la app vive en /entrenador-ia; en su dominio propio, en la raíz.
// Sin esa variable (desarrollo, pruebas automáticas) vale lo que dice app.json.
module.exports = ({ config }) => {
  const baseUrl = process.env.KETTAI_BASE_URL;
  if (baseUrl === undefined) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
