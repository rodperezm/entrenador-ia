# KETTAI · Lista de pendientes

Actualizada al 31-10-2026. Reemplaza la ayuda memoria del 27-10-2026, cuyos puntos ya están hechos o pasaron a esta lista.

## 1. Antes de compartir con amigos (lunes 2 de noviembre)
- [ ] Límite de consultas de IA por cuenta en el servidor. Hoy no existe.
- [ ] Pedir permiso antes de enviar datos a la IA. Hoy solo se informa en Privacidad.
- [ ] Revisar el límite mensual de gasto en la consola de Anthropic (lo revisa Rodrigo).
- [ ] Probar en iPhone real: registro, primera semana, entrenamiento, temporizador y aviso del lunes.
- [ ] Probar el respaldo: recuperar los datos en otro dispositivo.
- [ ] Definir un canal único para recibir comentarios y 5 preguntas para los amigos.
- [ ] Decidir si el respaldo sigue visible mientras un abogado no revise el texto de privacidad.
- [ ] Subir la rama `rediseno-hoy-semana` a GitHub y unirla a `main`.

## 2. Durante la prueba (2 a 4 semanas)
- [ ] Medir 20 a 30 generaciones reales: tokens, costo y tiempo.
- [ ] Comparar Opus, Sonnet y Haiku con los mismos casos, incluidos dolor y lesiones.
- [ ] Medir quién vuelve a la semana 2 y a la semana 4.
- [ ] Reclutar al menos 12 amigos con Android para Google Play.

## 3. Marca y empresa
- [ ] Buscar KETTAI y marcas parecidas en INAPI.
- [ ] Registrar la marca: clases 9 (app) y 41 (entrenamiento); evaluar la 42.
- [ ] Decidir si se crea una SpA antes de abrir las cuentas de tiendas.
- [ ] Abogado: privacidad, términos de uso, datos de salud, ley 21.719 y responsabilidad por lesiones.
- [ ] Contador: facturación e impuestos por ventas en tiendas.

## 4. Imágenes y ejercicios
- [ ] Responder a Gymvisual: revisar lista y precio del pack de 263 videos gris (correo del 30-10-2026, sin leer).
- [ ] Aclarar versión mujer, licencia por escrito y forma de pago (AMEX, Discover o PayPal).
- [ ] Definir cómo se ve cada video en la app y cuánto pesa.
- [x] Agregar la tanda 2: 15 ejercicios, 151 en total (`src/data/exercises.extra.batch2.ts`).
- [ ] Pedir a Gymvisual los videos de la tanda 2: borrador en `docs/cotizacion/solicitudes.md` y lista en `docs/cotizacion/ejercicios.csv`.
- [ ] Revisar con Fuerza los criterios acordados que siguen sin confirmar en el código.

## 5. Negocio
- [ ] Plan de negocios: gratis con reglas, pago con IA semanal, límites y precio con costos medidos.
- [ ] Mercado: partir en español (Chile, resto de Latinoamérica, España y público hispano de EE. UU.).
- [ ] Inglés como segunda etapa, si la retención en español lo justifica.
- [ ] Sin anuncios dentro de la app. Difusión con contenido, entrenadores y kinesiólogos.
- [ ] Publicidad pagada solo cuando la retención sea buena.
- [ ] IA: seguir pagando el servicio, sin modelo propio.
- [ ] Reducir costo con un modelo más económico, menos candidatos y mensaje reutilizable.

## 6. Tiendas de apps
- [ ] Cuenta Apple Developer (US$99 al año) y Google Play (US$25, pago único).
- [ ] Configurar la app nativa: identificadores, `eas.json`, ícono y pantallas de tienda.
- [ ] Compra dentro de la app con Apple y Google (suscripción).
- [ ] Funciones propias de app: notificaciones y, si conviene, Apple Salud.
- [ ] Cuenta de prueba para los revisores de Apple.
- [ ] Página pública para pedir el borrado de cuenta (Google la exige).
- [ ] Etiquetas de privacidad de Apple, Data safety y declaración de salud de Google.
- [ ] Edad mínima para usar la app.
- [ ] Prueba cerrada en Google: 12 personas durante 14 días seguidos, si la cuenta es personal.
- [ ] Botón Probar KETTAI de la página apuntando a las tiendas.

## 7. Si la app escala
- [ ] Tope de gasto de IA, alertas y planes por reglas como respaldo.
- [ ] Correo de códigos con servicio profesional y dominio `kettaiapp.com`.
- [ ] Supabase pagado, copias de seguridad y prueba de recuperación.
- [ ] Monitoreo de errores en la app y en la función de IA.
- [ ] Revisión de seguridad y plan para avisar brechas de datos.
- [ ] Soporte: correo, respuestas frecuentes y plazos.
- [ ] Control de calidad de la IA: casos fijos de lesiones antes de cada cambio.
- [ ] Precios por país, reembolsos y cancelaciones.
- [ ] Traducción de ejercicios, textos y fichas de tienda.

## Para retomar
- Arrancar el servidor: `$env:NODE_OPTIONS='--max-old-space-size=3072'; npx expo start` en `C:\dev\entrenador-ia`.
- En el iPhone: Expo Go → `exp://192.168.1.106:8081`.
- App web: https://rodperezm.github.io/entrenador-ia/ · Página: https://www.kettaiapp.com
