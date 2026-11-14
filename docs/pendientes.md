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
- [x] Bloque C en HIIT dentro del entrenamiento guiado, recomendado por reglas.
- [x] Desafío AMRAP en el bloque C, con marca, comparación y sección en Tu progreso.
- [x] La IA sugiere cierre normal, HIIT o AMRAP; las reglas de la app ponen el límite.
- [x] Probar con una consulta real que la IA entregue el cierre sugerido (funcionó; en un día sugirió AMRAP sin bloque C y la app no lo mostró).
- [ ] Probar HIIT y AMRAP con sonido en iPhone.
- [ ] Decidir la sesión completa en HIIT.
- [x] Ejercicios a un lado: «por lado», tiempo de ambos lados y totales del resumen.
- [ ] Subir la función `generate-plan` con las reglas de lados y de dos kettlebells.
- [x] Marcar qué lado duele durante el entrenamiento.
- [x] Preguntar de qué pesos tiene dos kettlebells.
- [x] Agregar 8 ejercicios con dos kettlebells, 159 en total.
- [ ] Ver los 8 videos de dos kettlebells y los 12 cambiados por búsqueda; se eligieron por título, sin verlos.
- [x] Limitar el peso de 6 ejercicios delicados según el nivel; sin peso adecuado, no se ofrecen.
- [x] Video de YouTube incrustado en la ficha de los 151 ejercicios (`src/data/youtubeVideos.ts`).
- [ ] Revisar los videos cuyo título no calza del todo con el ejercicio.
- [ ] Decidir si los videos de YouTube son definitivos o transitorios hasta tener videos propios.
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
  - [x] Producción usa Sonnet desde el 03-11-2026 (ajuste `CLAUDE_MODEL` en Supabase): ~US$0,15 por semana, cerca de la mitad que Opus.
- [ ] Idea por decidir: elegir el modelo en el plan pagado. Sugerencia: no mostrar nombres de modelos; diferenciar planes por cantidad de consultas y funciones con IA (rehacer un día, resumen del mes, ajuste a mitad de semana), con "IA avanzada" como nombre comercial. Un plan alto con Opus solo si una prueba con las mismas personas muestra rutinas claramente mejores.

## 5a. Idea a futuro: revisar la técnica con video e IA (consulta del 03-11-2026)
Solo análisis, nada decidido. Posible función del plan pagado.
- **Camino 1, imágenes a Claude:**
  - La persona graba o sube 10 a 20 s; la app saca 10 a 15 imágenes y Claude da 2 o 3 observaciones según ejercicio, nivel y lesiones.
  - Detecta bien posturas (espalda redonda, rodillas hacia adentro, profundidad, bloqueo del press, kettlebell lejos del cuerpo). Detecta mal la velocidad y el ritmo (golpe de cadera del swing, momento del clean).
  - Costo estimado con Sonnet: US$0,05 a 0,10 por revisión; medirlo.
  - Esfuerzo medio (días). Funciona en la app web.
- **Camino 2, postura en el teléfono:**
  - MediaPipe marca puntos del cuerpo y mide ángulos y velocidad, sin enviar el video. Permite avisos en vivo y cuesta casi nada por uso.
  - Más difícil (semanas), con reglas por ejercicio.
  - Combinado: enviar los ángulos a Claude como texto para que redacte la corrección.
- **Cuidados:**
  - No guardar el video y pedir permiso explícito.
  - Hablar de "observaciones de técnica", nunca diagnóstico; con dolor, parar y consultar.
  - Instrucciones de grabación: teléfono apoyado, de lado, a 2 o 3 m, cuerpo completo y buena luz.
- **Sugerencia:** partir con el camino 1 en 3 a 5 ejercicios (swing, sentadilla goblet, peso muerto, press y remo), probado con videos reales del usuario y amigos; si funciona, sumar el camino 2.

## 5b. Idea por decidir: vender nosotros, sin tiendas (análisis del 03-11-2026)
Solo análisis, nada decidido ni programado. Las cifras son aproximadas; confirmarlas con cada proveedor antes de decidir.

**A favor**
- Sin la comisión de Apple o Google (15 % el primer millón de dólares al año, 30 % sobre eso). Una pasarela cobra cerca de 3 a 5 % por pago: a US$5 quedan unos US$4,80 en vez de US$4,25.
- Sin revisión de las tiendas: cada cambio se publica el mismo día, como hoy.
- Sin pagar las cuentas de desarrollador (US$99 al año Apple, US$25 Google).
- La relación con el cliente es nuestra: correo, precio, promociones, descuentos por país y códigos de entrenadores.
- La app web ya funciona en iPhone y Android, con guías de instalación.

**En contra**
- Nadie nos encuentra "buscando en la tienda": toda la llegada depende de la difusión propia.
- Menos confianza al pagar: hay que dar la tarjeta en un sitio nuevo y no con Apple Pay o Google Pay de la tienda.
- Cancelar, reembolsar y reclamar pasa por nosotros: hay que dar soporte.
- Nosotros emitimos boleta y pagamos el IVA. En Chile, 19 % en servicios digitales; en otros países depende de cada uno, salvo que se use un "vendedor registrado" que se encargue.
- La app web tiene límites: avisos en el iPhone más débiles, sin Apple Salud y con sonido que Safari a veces bloquea.
- Si después entramos a las tiendas, Apple y Google exigen ofrecer la compra dentro de la app para lo que se vende ahí. Quien pagó en la web podría entrar con su cuenta, pero dentro de la app no se puede invitar a pagar afuera, salvo excepciones por país.

**Lo que habría que programar si vendemos nosotros**
1. **Medios de pago con suscripción mensual automática.**
   - Para Chile: Mercado Pago, Flow o Webpay de Transbank.
   - Para varios países: Mercado Pago (Latinoamérica), Stripe (revisar si acepta cuentas de Chile), o un vendedor registrado como Paddle o Lemon Squeezy, que cobra más pero se hace cargo de los impuestos de cada país.
2. **Página de planes y pago** en kettaiapp.com, con precio en moneda local.
3. **Pagos y cuentas conectados.**
   - El proveedor avisa a nuestro servidor (webhook) cada pago, rechazo, renovación o cancelación. Una función de Supabase actualiza `ai_plans.weekly_limit` de esa cuenta: 1 o 2 consultas si pagó, 0 o solo reglas si no.
   - Guardar para cada cuenta: plan, estado (activo, atrasado, cancelado) y fecha de vencimiento.
   - Gracia de unos días si falla la tarjeta antes de bajar al plan gratis, con aviso por correo.
   - Al cancelar, mantener el plan hasta fin del mes pagado.
   - Revisión diaria automática por si se perdió un aviso del proveedor.
4. **Cuenta real obligatoria para pagar.** Ya existe con correo. Falta exigir correo en la función para usar la IA, y evitar que borrar y recrear la cuenta reinicie el límite.
5. **Pantalla "Mi plan" en la app:** plan actual, próximo cobro, cambiar o cancelar (el enlace lo da el proveedor) y boletas.
6. **Correos automáticos:** bienvenida, pago recibido, tarjeta rechazada, plan por vencer y cancelación.
7. **Boleta electrónica** (SII) por cada pago, o un proveedor que la emita solo.
8. **Términos de uso, política de reembolso y precio con impuestos** visibles antes de pagar (Ley del Consumidor).
9. **Códigos de descuento y de referido**, para entrenadores y kinesiólogos (ver difusión).
10. **Panel simple para ti:** cuántos pagan, cuántos cancelan, ingreso del mes y gasto de IA.

**Publicidad en el plan gratis: qué significaría**
- Choca con una decisión anterior de esta lista: "Sin anuncios dentro de la app". Hay que elegir una.
- Rinde poco con pocos usuarios: del orden de pocos dólares por cada mil anuncios vistos. Con cientos de usuarios no paga ni el dominio; sirve recién con decenas de miles.
- Empeora la experiencia. Nunca durante un entrenamiento, el temporizador o un ejercicio con dolor; a lo más en Progreso o al terminar la sesión.
- La app guarda datos de salud: los anuncios no pueden usarlos para segmentar, y la mayoría de las redes de anuncios rastrean. Exige aviso de cookies, consentimiento y cambios en la política de privacidad. La nueva ley chilena de datos personales (Ley 21.719, vigente desde diciembre de 2026) trata los datos de salud como sensibles.
- En las tiendas, los anuncios cambian las etiquetas de privacidad y la revisión.
- Alternativa sugerida: el plan gratis sin anuncios, con un aviso propio y amable para pasar al plan pagado (por ejemplo, "Esta semana la armaron las reglas; con IA se ajusta a tu evolución"). O un único espacio para un patrocinador elegido por nosotros, como una marca de kettlebells, sin rastreo.

**Difusión con entrenadores, influencers y kinesiólogos**
- **Entrenadores e influencers de kettlebell o fuerza:** código propio con descuento para su comunidad y comisión por cada persona que paga, por ejemplo 20 a 30 % durante los primeros meses. Requiere los códigos de referido del punto 9 y un reporte de cuánto trajo cada uno.
- **Kinesiólogos:** son los más creíbles por el foco en lesiones. Se les puede dar acceso gratis para sus pacientes y un código. Más adelante, una "vista para el kinesiólogo" donde el paciente comparte su dolor por ejercicio y su avance, solo si el paciente lo autoriza.
- **Cuidado con lo que se promete:** la app no reemplaza al profesional de salud y no debe anunciarse como tratamiento. Los avisos deben decir que son publicidad pagada.
- **Partir chico:** 3 a 5 entrenadores o kinesiólogos de confianza, medir cuántos se quedan después de un mes y recién ahí ampliar.

**Recomendación**
1. Partir vendiendo nosotros en la web, en Chile, con Mercado Pago o Flow y un solo plan pagado. Es lo más rápido, barato y fácil de cambiar.
2. Plan gratis sin anuncios.
3. Difusión con pocos kinesiólogos y entrenadores, con códigos.
4. Entrar a las tiendas cuando haya personas pagando y la retención sea buena, sumando la compra dentro de la app.

## 6. Tiendas de apps
- [ ] Cuenta Apple Developer (US$99 al año) y Google Play (US$25, pago único).
- [ ] Configurar la app nativa: identificadores, `eas.json`, ícono y pantallas de tienda.
- [ ] Compra dentro de la app con Apple y Google (suscripción).
- [ ] Funciones propias de app: notificaciones y, si conviene, Apple Salud.
- [ ] Podómetro (`expo-sensors`, Pedometer; incluido en Expo Go). No funciona en la app web.
  - iPhone: pasos de los últimos 7 días, aunque la app haya estado cerrada.
  - Android: solo mientras la app está abierta; el día completo requiere Health Connect.
  - Uso: pasos del día en Hoy y Progreso, y en la IA como señal de recuperación (por ejemplo, muchos pasos ayer → piernas más suave).
  - Esfuerzo: mostrar pasos, fácil; IA y progreso, fácil a medio; Health Connect, medio a difícil.
  - Alternativa para la web: anotar los pasos a mano.
- [ ] Antes de publicar en Android: guardar el historial como una clave por sesión, con un índice (anotado el 10-11-2026).
  - Por qué: en Android cada dato guardado tiene un tope cercano a 2 MB; una sesión pesa unos 6 KB, así que el historial en un solo bloque se llena cerca de las 330 sesiones. En la web ese tope no aplica.
  - Riesgo: un teléfono con una versión antigua en caché seguiría usando el bloque único y, al sincronizar, podría marcar como borradas en la nube las sesiones nuevas.
  - Cómo: esperar unas semanas con la versión actual publicada; copiar cada sesión a su clave, releer para comprobar y conservar `history.v1` como copia; recién después dejar de usar el bloque único.
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

## 8. Lógica de entrenamiento (evaluación externa del 12-11-2026)
Notas dentro del alcance: Gemini 9,2 y 9,0; ChatGPT 8,0 y 8,1. Meta de 8 cumplida. Detalle en `docs/Evaluacion-4-resultados.md`.
- [ ] Tope de series por zona a la semana (por decidir). Propuesta: 10 principiante, 16 intermedio, 20 avanzado; si una zona se pasa, se cambia su último ejercicio por uno de una zona con menos carga. Sirve sobre todo con 5 y 6 días.
- [ ] Prueba inicial opcional (por decidir): sentadilla a una silla, plancha por tiempo, flexiones en 30 s indicando si es en el suelo o apoyando rodillas, y equilibrio en un pie.
- [x] Publicado el 12-11-2026: semana 3 y ciclo nuevo sin saltos grandes de pesa, y balísticos de a uno.
- [ ] Quinta evaluación (Gemini 9,3 y 9,1; ChatGPT 8,3 y 8,4; Claude 8,3 y 8,0), por decidir: alertas médicas graves que bloqueen en vez de solo avisar; intermedio partiendo en la etapa 1 del swing; confirmar técnica solo con esfuerzo 8 o menos; rangos de repeticiones más amplios con pesas livianas. Detalle en `docs/Evaluacion-5-resultados.md`.

## 9. UX y UI (revisión del 12 y 13-11-2026)
Publicado: UX 1 a 4, 6 y 7 (pantalla de error, menú de perfil y cuenta, «Mi perfil» con pasos sueltos, avance de la IA, confirmaciones propias, aviso sin conexión) y UI 1 a 6 (paleta de la página, letra de la marca en títulos, textos de 12 puntos o más, lectores de pantalla, colores en el tema, pantalla de carga).
- [ ] UX 5, pestaña «Tabata/HIIT»: en espera. Primero probar el HIIT y el AMRAP con reloj dentro del entrenamiento; si cubren ese uso, sacar la pestaña y dejar el temporizador como acceso en Hoy.
- [ ] Probar en el teléfono: barra superior en iPhone (el título se cortaba arriba), una semana real con IA, y el lector de pantalla (VoiceOver).
- [ ] Prueba inicial de capacidad: mediría solo la condición física, ahora que la experiencia con kettlebell es una pregunta aparte. Faltan los umbrales; llevarlos al experto.

## 10. Operación (13-11-2026)
- [x] Trabajo subido a GitHub (rama `mejoras-evaluacion-3`).
- [x] Registro de errores y comentarios, con pestaña «Reportes» en el panel.
- [x] Copia diaria de la base en el servidor de casa (`~/kettai-copia`, 04:30 de Chile, 30 días).
- [x] Segunda copia automática: el PC trae las copias del servidor a Google Drive (`G:Mi unidadKETTAI-copias`), tarea diaria a las 10:00.
- [ ] Confirmar el 14-11 que la copia automática corrió sola (el panel muestra «Última copia de seguridad»).
- [ ] Cambiar la clave del acceso de copia, que quedó visible en una captura del chat.
- [ ] Aviso por mensaje cuando falla la copia o llega un reporte (se puede armar con n8n).
- [ ] Reunión con el experto, textos legales y, antes de abrir la app, plan Pro de Supabase.
- [ ] Unir las ramas a la principal (`main` está 60 registros atrás).

## Para retomar
- Arrancar el servidor: `$env:NODE_OPTIONS='--max-old-space-size=3072'; npx expo start` en `C:\dev\entrenador-ia`.
- En el iPhone: Expo Go → `exp://192.168.1.106:8081`.
- App web: https://rodperezm.github.io/entrenador-ia/ · Página: https://www.kettaiapp.com
