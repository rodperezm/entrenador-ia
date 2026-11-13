# Versiones de KETTAI

Cada vez que algo pasa a producción recibe un número de versión y queda anotado aquí. Sirve para
saber qué tiene cada teléfono (el menú de la app muestra «Versión 1.1.0 · a1b2c3») y para volver
atrás con una instrucción clara: «volver a la 1.1.0».

## Cómo se numera

`mayor.menor.arreglo`, por ejemplo `1.2.0`.

- **Arreglo** (1.1.0 → 1.1.1): correcciones que no cambian cómo se usa la app.
- **Menor** (1.1.0 → 1.2.0): algo nuevo o un cambio que la persona nota.
- **Mayor** (1.x → 2.0.0): un cambio grande, o uno que no se puede deshacer en los teléfonos.

El código corto que acompaña al número (por ejemplo `a1b2c3`) identifica la publicación exacta:
cambia cada vez que se publica, aunque el número sea el mismo.

## Cómo se saca una versión

1. Subir el número en `app.json` y `package.json`.
2. Escribir la entrada de la versión en este archivo, con sus tres partes (ver «Cómo se escribe cada versión»).
3. Guardar en Git y marcar la versión: `git tag -a v1.2.0 -m "…"`.
4. Publicar en este orden: base de datos, función de la IA, app. La publicación de la app limpia la memoria temporal (`--clear`): sin eso, el número nuevo no llega a la app.
5. Comprobar en un teléfono que el menú muestra la versión nueva.
6. Enviar la entrada de la versión al correo de KETTAI (kettaiapp@gmail.com), con el asunto «KETTAI · versión 1.2.0».

## Cómo se escribe cada versión

Una sola entrada por versión, con tres partes fijas. No hay un resumen para personas y otro para
quien programa: es el mismo texto, ordenado según quién lo necesita.

1. **Qué cambia para la persona.** En palabras de quien usa la app, sin términos técnicos.
2. **Qué cambia por dentro.** Qué partes se tocaron (app, base de datos, función de la IA, panel, página) y por qué.
3. **Notas para quien siga el trabajo.** Lo que no se deduce del código: decisiones tomadas, trampas encontradas, lo que quedó a medias y qué cuidado pide volver atrás. Es la parte pensada para Claude Code o para un desarrollador que llegue después.

## Cómo se vuelve a una versión anterior

- **App:** publicar de nuevo desde la marca de esa versión (`git checkout v1.1.0`, publicar y volver a la rama de trabajo). Los teléfonos la toman en unos 15 minutos.
- **Función de la IA:** volver a publicar en Supabase el archivo `supabase/functions/generate-plan/index.ts` de esa marca.
- **Base de datos:** no se deshace sola. Por eso los cambios de datos siempre agregan y nunca quitan ni renombran: así una app anterior sigue funcionando con la base nueva. Si hay que deshacer un cambio, se escribe una migración nueva.
- **Datos guardados en cada teléfono:** no vuelven atrás. Una versión que cambie su formato de forma incompatible es un cambio «mayor» y se avisa en su entrada.

## Historial

### 1.1.0 · 13 de noviembre de 2026

Primera versión con número. Cierra la etapa de construcción y deja la app lista para probarla con más orden.

**Qué cambia para la persona**

- La app pide leer y aceptar los Términos y condiciones: al registrarse y, a quien ya tenía perfil, con un aviso en «Hoy».
- En iPhone, la barra de abajo ya no corta los nombres de las pestañas y el título de arriba se ve nítido.
- La pestaña del temporizador se llama «HIIT».
- En Ejercicios, cada ficha dice «Dificultad 2 de 5» en vez de «Nivel 2».
- La guía de medición ya no trae la tabla de medidas de referencia.
- El menú del ícono de persona muestra el número de versión.

**Qué cambia por dentro**

- App: pantalla de Términos con versión aceptada y fecha guardadas en el perfil; medición anónima de hasta qué paso del registro llega cada teléfono; alto de pantalla tomado del teléfono cuando la app está instalada en iPhone.
- Base de datos: tabla `onboarding_steps` y sus dos funciones (migración `0009`). Solo agrega.
- Función de la IA: sin cambios desde la revisión de seguridad del 12 de noviembre.
- Panel: «Abandono dentro del registro» en la pestaña Método y en la hoja Embudo del Excel.
- Pruebas: 6 casos fijos para la IA, con un revisor que pone nota y las respuestas reales guardadas. 92 pruebas automáticas.

**Notas para quien siga el trabajo**

- Los Términos son un borrador sin revisar por un abogado (`src/content/terms.ts`). Al cambiar el texto hay que subir `TERMS_VERSION` para que la app vuelva a pedir la aceptación.
- La app instalada en iPhone guarda la versión anterior unos minutos: para saber qué tiene un teléfono, mirar la versión en el menú antes de diagnosticar.
- Los casos fijos de la IA se corren desde `/ai-cases`, solo en modo desarrollo, y cada caso es una consulta real. Nota de partida: 9,9 con Sonnet 5.5. Mide que la IA respete las reglas, no la calidad del entrenamiento.
- Anthropic tiene un límite de gasto mensual aparte del saldo; cuando se alcanza, la IA queda bloqueada para todos y la app arma las semanas con las reglas.
- No hay ambiente de pruebas separado: desarrollo usa la misma base que producción.
- Pendiente de decidir: los 175 textos candidatos a español neutro (`docs/Revision-espanol-neutro.xlsx`).
- Vuelta atrás: no hay una versión numerada anterior. Las publicaciones previas están en el historial de Git.

## Antes de las versiones: hitos

Entre el 27 de octubre y el 12 de noviembre de 2026 la app se publicó de forma continua, sin números.
Esto es un resumen por etapas, reconstruido del historial de Git; las fechas son aproximadas.

### 27 al 30 de octubre · Primera app que se puede usar

- **Para la persona:** arma una semana de entrenamiento con IA según su perfil, lesiones y equipamiento, en casa o en el parque; entrenamiento guiado serie a serie; registro de esfuerzo y dolor en cuatro niveles; medidas corporales; se instala en el inicio del iPhone.
- **Por dentro:** app web con Expo publicada en GitHub Pages; función `generate-plan` en Supabase que consulta a Claude; reglas propias como respaldo cuando la IA no responde.
- **Notas:** aquí nacieron los ajustes de pantalla completa y márgenes del iPhone, y la señal cada 10 segundos para que Safari no corte la espera de la IA. La marca pasó de KettleIA a KETTAI el 30 de octubre.

### 31 de octubre al 5 de noviembre · Método de entrenamiento

- **Para la persona:** pantallas «Hoy» y «Semana» separadas; sesión de Fuerza en bloques A, B y C; ciclos de 4 semanas; cierre con HIIT o AMRAP; videos en cada ejercicio; preguntas de cómo llega y cómo estuvo; «No puedo hacerlo»; descarga de sus datos en Excel.
- **Por dentro:** límite de semanas con IA por cuenta y base de los planes; cuenta con correo y código, sin contraseña; Sonnet como modelo de la IA; temporizador web con audio propio.
- **Notas:** regla de fondo desde esta etapa: manda lo que la persona dice (dolor, cansancio, ganas de más) por encima de la edad o de filtros fijos. La IA elige, pero la app revisa y corrige lo que no puede quedar a su criterio.

### 7 al 10 de noviembre · Panel, variedad y cuidado de los datos

- **Para la persona:** la app calcula cuántos ejercicios lleva cada parte según sus minutos; ejercicios ancla que se mantienen todo el ciclo y el resto rota; el entrenamiento en curso se guarda tras cada serie y se puede retomar.
- **Por dentro:** panel de control en kettaiapp.com/Panel; revisión de la capa de datos para que nada se pierda si falla la carga o el respaldo.
- **Notas:** el historial todavía se guarda como un solo bloque; pasarlo a una clave por sesión queda para antes de publicar en Android.

### 12 de noviembre · Evaluaciones, seguridad y operación

- **Para la persona:** Fuerza por zonas con 4 a 6 días; el nivel se separa en condición física y experiencia con kettlebell; avisos de errores y pantalla para enviar comentarios; recordatorios en el calendario; nueva letra y colores de la marca.
- **Por dentro:** cupo de IA con reserva y tope diario; registro de errores; copia diaria de la base en un servidor propio y segunda copia en Google Drive; panel rediseñado con Excel, ejercicios que piden atención y embudo.
- **Notas:** tres evaluadores externos (Gemini, ChatGPT y Claude) pusieron nota sobre 8 dentro del alcance definido. Quedaron abiertos el tope semanal de series y la prueba inicial de capacidad.
