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

## Dónde se publica

Los destinos están en `ambientes.json`: cada uno dice su dirección, qué base de datos usa, si es de pruebas (muestra una franja «PRUEBAS») y si avisa de una mudanza (muestra «KETTAI se muda a…» en Hoy).

- `npm run deploy`: publica en la dirección de GitHub.
- `npm run deploy:kettaiapp`: publica en app.kettaiapp.com (todavía no está abierta).
- Agregar `--solo-armar` al comando de `tools/publicar/publicar.cjs` deja la carpeta lista sin publicar.

Plan de ambientes: la dirección de GitHub pasará a ser pruebas, con su propia base, y app.kettaiapp.com será producción. Hasta entonces las dos usan la base actual.

## Cómo se vuelve a una versión anterior

- **App:** publicar de nuevo desde la marca de esa versión (`git checkout v1.1.0`, publicar y volver a la rama de trabajo). Los teléfonos la toman en unos 15 minutos.
- **Función de la IA:** volver a publicar en Supabase el archivo `supabase/functions/generate-plan/index.ts` de esa marca.
- **Base de datos:** no se deshace sola. Por eso los cambios de datos siempre agregan y nunca quitan ni renombran: así una app anterior sigue funcionando con la base nueva. Si hay que deshacer un cambio, se escribe una migración nueva.
- **Datos guardados en cada teléfono:** no vuelven atrás. Una versión que cambie su formato de forma incompatible es un cambio «mayor» y se avisa en su entrada.

## Historial

### 1.8.1 · 14 de noviembre de 2026

Arreglo del correo al crear la cuenta, y guía de instalación única para invitar a probar la app.

**Qué cambia para la persona**

- Si al escribir el correo se cuela un espacio (por ejemplo, «gmail. com»), la app lo quita sola y deja pedir el código. Antes el botón «Enviarme un código» quedaba apagado sin explicación.
- Si el correo está mal escrito, al salir del campo aparece «Revisa tu correo: debe verse como nombre@correo.com.».
- Guía de instalación en una sola página (`/instalar`), con selector iPhone / Android, lo que trae la app y un botón para compartir por WhatsApp. Las direcciones antiguas de las guías llevan a la nueva.
- Los botones «Probar KETTAI» de kettaiapp.com llevan a esa guía (antes volvían al inicio del sitio).

**Qué cambia por dentro**

- App: `src/features/account/email.ts` (limpia y valida el correo) y su uso en `BackupSetup.tsx`; pruebas en `tests/email.test.ts` (110 en total).
- `public/instalar.html` nueva; `instalar-iphone.html` e `instalar-android.html` pasan a redirigir.
- `tools/publicar/publicar.cjs` ajusta la dirección en todos los archivos de texto de `public/`, no en una lista fija.
- Sitio (`marketing/index.html`): enlace de los dos botones. Se publica aparte con `wrangler pages deploy marketing --project-name kettai --branch main`.
- Sin cambios en la base de datos ni en la función de la IA.

**Notas para quien siga el trabajo**

- El caso lo encontró un amigo de Rodrigo en un iPad: el teclado metió un espacio dentro del correo y la validación solo quitaba los de los extremos.
- La guía nueva salió unos minutos en producción con la dirección de pruebas, porque el script solo ajustaba una lista fija de archivos. Ya está corregido; después de publicar una página nueva, buscar en ella la dirección del otro ambiente.
- Pasos de Android validados contra la ayuda oficial de Chrome, sin probarlos en un teléfono Android real.
- Vuelta atrás: publicar desde `v1.8.0`. No deja nada a medias en los teléfonos.

### 1.8.0 · 13 de noviembre de 2026

Cuerpo rediseñado: el peso va primero y se puede registrar solo, sin la cinta.

**Qué cambia para la persona**

- **Cuerpo** abre con el peso en grande, el cambio desde la vez anterior, unas barras con los últimos pesos y el IMC como una barra de colores con un marcador.
- Registrar son tres tarjetas: «Solo el peso» (fecha y peso, nada más), «Con cinta» y «Pliegues».
- Registrar solo el peso ya no deja en blanco la cintura, la cadera ni los índices: cada medida muestra su último valor, con su fecha.
- Al registrar pliegues, el peso es obligatorio. Si ese día ya se registró, se usa ese y basta con confirmarlo.

**Qué cambia por dentro**

- App: `src/app/(tabs)/body.tsx` nuevo; `src/app/body/new.tsx` suma el modo `type=weight` y el peso obligatorio en pliegues.
- Reglas en `src/domain/body.ts`: `latestBody` (lo último de cada medida), `latestRecord`, `weightSeries` y `mergeIntoDay`.
- Pruebas: 107 (se sumaron cuatro de estas reglas).
- Sin cambios en la base de datos ni en la función de la IA. El formato guardado en el teléfono es el mismo.

**Notas para quien siga el trabajo**

- Decisión de Rodrigo: el peso se registra sin obligación de medir con cinta; con pliegues el peso sí es obligatorio, porque con él se calculan los kilos de grasa y de masa magra.
- Los índices (ICC, ICE, abdomen − cintura, IMC) se calculan con lo último de cada medida, aunque venga de registros de fechas distintas. La tarjeta «Tus medidas» muestra la fecha de cada una para que eso se note.
- Guardar un dato en una fecha que ya tiene registro lo suma a ese registro (`mergeIntoDay`): no se crean dos registros del mismo día y un campo vacío no borra lo que había.
- El número gris del campo de peso («78,4») es un ejemplo de formato; a Rodrigo le hizo ruido, pero pidió dejarlo.
- Los textos nuevos no pasaron por la revisión de español neutro.
- Vuelta atrás: publicar desde `v1.7.0`. No deja nada a medias en los teléfonos.

### 1.7.0 · 13 de noviembre de 2026

Progreso y Ejercicios rediseñados, rutinas rápidas para estirar y el arreglo del borde inferior en el iPhone. Cerrada tras un recorrido automático de todas las pantallas.

**Qué cambia para la persona**

- **Progreso** responde «¿voy bien?»: una frase de resumen, las sesiones de las últimas 6 semanas en barras con fecha, la fuerza en los ejercicios principales, la etapa con la kettlebell y cómo responde el cuerpo.
- **Ejercicios** empieza con «¿Qué necesitas hoy?»: cinco rutinas rápidas (estirar todo el cuerpo, zona alta, zona baja, mucho rato sentado, rodillas rígidas) de 5 o 6 minutos, guiadas paso a paso con cuenta regresiva y sonido.
- Ejercicios suma buscador, «En tu semana», zonas del cuerpo con color y cantidad, dificultad como barra y «Lo hiciste N veces».
- En el iPhone, con la app instalada, las pantallas llegan al borde inferior: ya no se cortan los botones del temporizador.
- Una dirección que no existe muestra «Esta página no existe» en español, con un botón para volver.
- Cuando la IA no responde, el aviso ya no repite lo que dice la tarjeta de la semana.

**Qué cambia por dentro**

- App: `src/app/progress.tsx` nuevo sobre `progressSummary` (ahora entrega `weeks` y `body`); `src/app/(tabs)/exercises.tsx` nuevo; pantalla `src/app/routine/[id].tsx`; reglas en `src/domain/quickRoutines.ts` y colores en `src/features/routines/tones.ts`; `src/app/+not-found.tsx`.
- `public/index.html`: con la app instalada en iPhone, el marco pasa a `position: absolute` con el alto de `screen.height`. El temporizador se abre como pantalla normal en la web.
- Pruebas: 103 (se sumaron las de constancia, cuerpo y rutinas rápidas).
- Sin cambios en la base de datos ni en la función de la IA.

**Notas para quien siga el trabajo**

- Las rutinas rápidas son listas fijas elegidas a mano, sin IA, y **no se guardan en el historial**: no cuentan para el ciclo ni para las cargas. Una prueba exige que solo usen colchoneta y duren entre 3 y 10 minutos.
- «Rodillas rígidas» lleva aviso de que no es tratamiento. Las promesas de salud deben pasar por el experto y el abogado antes de sumar rutinas «por problema» (idea anotada, sin hacer).
- Un enlace de Expo Router con `asChild` no acepta una lista de estilos en su hijo: usar `StyleSheet.flatten`. Rompe la pantalla completa, no solo el estilo.
- Recorrido de diagnóstico: Playwright con WebKit en tamaño iPhone, sobre el servidor local arrancado con la configuración `sin-nube` de `.claude/launch.json` (una dirección de Supabase inválida deja pasar la puerta de cuentas y hace que la semana se arme con reglas, sin gastar IA). Los avisos de `react-native-svg` («Unknown event handler», «accessible») son solo del modo de desarrollo.
- Quedó sin tocar, por ser decisión de producto: el aviso «Completa toma más de tus N min» aparece aunque la sesión se pase por 1 minuto. También quedan enlaces de texto con poca altura para el dedo («Ver semana ›», «Leer cómo cuidamos tus datos»).
- Los textos nuevos no pasaron por la revisión de español neutro del Excel.
- Vuelta atrás: publicar desde `v1.6.0`. No hay cambios de datos, así que no deja nada a medias en los teléfonos.

### 1.6.0 · 13 de noviembre de 2026

Etapa de prueba cerrada: para usar la app hay que tener cuenta con correo y que el administrador la apruebe. Primera versión que pasó por pruebas antes de llegar a producción.

**Qué cambia para la persona**

- Sin cuenta con correo, la app muestra «Crea tu cuenta» y no deja entrar.
- Quien se registra ve «Tu cuenta espera aprobación». Cuando el administrador la aprueba, entra sola al volver a la app. Lo que tenía guardado en el teléfono se conserva.
- Quienes ya tenían cuenta con correo siguen entrando igual.

**Qué cambia por dentro**

- Base de datos (migración `0010`): tabla de cuentas aprobadas, ajuste `approval_required`, y el bloqueo en el servidor: sin aprobación no se puede guardar respaldo ni usar la IA.
- App: puerta de entrada (`AccessGate`) antes de las pestañas.
- Panel: lista «Pendientes de aprobar» con botón por persona, alerta en «Hoy» e interruptor «Cuentas nuevas» en los ajustes.
- Panel en dos ambientes: `kettaiapp.com/Panel` mira la base real y `pruebas.kettai.pages.dev/Panel` la de pruebas.

**Notas para quien siga el trabajo**

- Para abrir la app al público: en el panel, Ajustes → «Cuentas nuevas: entran sin aprobación». No hay que reprogramar nada.
- No hay aviso por correo cuando alguien queda en espera; el administrador se entera por la alerta del panel. Queda pendiente.
- Las cuentas anónimas antiguas ya no pueden usar la IA ni respaldar: deben crear cuenta con correo.
- El panel de pruebas se publica con `wrangler pages deploy marketing --project-name kettai --branch pruebas`; el de producción, con `--branch main`.
- Mejoras anotadas en la validación, para la próxima vuelta: avisar de la espera antes de pedir el perfil; opción «No tengo lesiones ni dolor» arriba en el paso de lesiones; corregir el aviso «elige crear respaldo» al entrar con un correo que no existe.
- Vuelta atrás: apagar el ajuste `approval_required` desde el panel deja todo como antes, sin publicar nada.

### 1.5.0 · 13 de noviembre de 2026

Quedan separados los dos ambientes: la dirección de GitHub pasa a ser pruebas, con su propia base de datos, y app.kettaiapp.com es producción.

**Qué cambia para la persona**

- En app.kettaiapp.com no cambia nada.
- La dirección de GitHub muestra arriba una franja amarilla «PRUEBAS · la app real está en app.kettaiapp.com», que al tocarla lleva a la app real. Lo que se haga ahí queda en una base aparte y no llega a la app real.

**Qué cambia por dentro**

- Supabase: proyecto nuevo `kettai-pruebas`, con las 9 migraciones, sesiones anónimas, código de 8 dígitos, correo de envío propio y la función `generate-plan`.
- App: el destino `github` usa `.env.pruebas` y `papel: pruebas`. Producción no cambia de base.
- GitHub: tarea diaria que consulta la base de pruebas para que Supabase no la pause.

**Notas para quien siga el trabajo**

- Flujo desde ahora: publicar en pruebas con `npm run deploy`, validar, y solo con el visto bueno pasar a producción con `npm run deploy:kettaiapp`.
- Las migraciones se aplican primero en pruebas y después en producción.
- La función de pruebas no tiene `ANTHROPIC_API_KEY`: ahí las semanas se arman con las reglas. Para probar la IA en pruebas, Rodrigo debe poner la clave en los secretos de ese proyecto.
- Quien tenía datos guardados solo en la dirección de GitHub los conserva en su teléfono, pero ya no se respaldan en la base real.
- El día de este cambio el conector de Supabase estuvo caído: el proyecto se creó y configuró desde el panel.
- Vuelta atrás: devolver `github` a `papel: produccion` y `claves: .env` en `ambientes.json`, y publicar.

### 1.4.0 · 13 de noviembre de 2026

Empieza la mudanza: la dirección de GitHub avisa que la app se cambia a app.kettaiapp.com.

**Qué cambia para la persona**

- En la dirección de GitHub aparece en «Hoy» el aviso «KETTAI se muda a app.kettaiapp.com», con los pasos. A quien tiene cuenta le dice cómo entrar en la nueva; a quien no, que primero cree su cuenta para no perder sus datos.
- En app.kettaiapp.com no cambia nada a la vista.

**Qué cambia por dentro**

- Solo configuración: `mudanza` encendida para el destino `github` en `ambientes.json`.
- Base de datos y función de la IA: sin cambios. Las dos direcciones siguen usando la misma base.

**Notas para quien siga el trabajo**

- La dirección de GitHub no se apaga ni cambia de base todavía: sigue funcionando completa mientras dure la mudanza.
- Para saber cuándo terminar la mudanza, mirar en el panel cuántas cuentas siguen activas sin correo: esas personas no pueden llevarse sus datos.
- Paso siguiente: crear el proyecto de Supabase de pruebas, pasar `github` a `papel: pruebas` con su archivo de claves, y dejar en el servidor de la casa la consulta diaria que lo mantiene despierto.
- Vuelta atrás: poner `mudanza` vacío y publicar en GitHub.

### 1.3.0 · 13 de noviembre de 2026

La app avisa cuando hay una versión nueva publicada.

**Qué cambia para la persona**

- Al abrir la app o volver a ella, si hay una versión más nueva aparece una franja «Hay una versión nueva · Toca para actualizar». Al tocarla, la app se recarga con lo nuevo.

**Qué cambia por dentro**

- App: compara el archivo principal con que se abrió con el publicado, al abrir y al volver a primer plano, como máximo cada 5 minutos. No se recarga sola, para no interrumpir un entrenamiento.
- Base de datos y función de la IA: sin cambios.

**Notas para quien siga el trabajo**

- El iPhone mantiene la app instalada en memoria: aunque el servidor entregue lo nuevo, la persona sigue viendo la versión con que la abrió hasta cerrarla del todo. Este aviso existe por eso.
- Quien tenga una versión anterior a esta no ve el aviso: tiene que cerrar la app del todo y abrirla una vez más.
- El entrenamiento en curso se guarda tras cada serie, así que recargar no lo pierde.
- Vuelta atrás: sin cuidado especial.

### 1.2.1 · 13 de noviembre de 2026

Arreglo: en app.kettaiapp.com la app se veía con otra letra y sin los íconos de la barra de abajo.

**Qué cambia para la persona**

- En la dirección nueva, los títulos vuelven a tener la letra de la marca y la barra de abajo muestra sus íconos. En la dirección de GitHub no cambia nada a la vista.

**Qué cambia por dentro**

- Publicación: la carpeta de fuentes `assets/node_modules` se renombra a `assets/modulos` y se ajustan las referencias, en todos los destinos.
- Base de datos y función de la IA: sin cambios.

**Notas para quien siga el trabajo**

- Cloudflare Pages no sube carpetas llamadas `node_modules`; GitHub Pages sí (con el `.gitignore` vacío). Por eso el problema solo apareció en la dirección nueva.
- En iPhone, Safari y el ícono instalado guardan la sesión por separado: hay que entrar con la cuenta desde el ícono, no desde Safari. El aviso de mudanza ya lo dice así.
- Al probar una dirección nueva, revisar que carguen las fuentes (letra de títulos e íconos), no solo que la página abra.
- Vuelta atrás: sin cuidado especial.

### 1.2.0 · 13 de noviembre de 2026

La app abre su dirección propia, app.kettaiapp.com, como futura producción. La dirección de GitHub sigue funcionando igual.

**Qué cambia para la persona**

- Nada en el uso diario. La app también se puede abrir en app.kettaiapp.com; quien entra ahí con «Ya tengo cuenta» recupera sus datos desde el respaldo.
- En el aviso de los Términos, los botones «Leer» y «Acepto» van uno bajo el otro.

**Qué cambia por dentro**

- App: destinos de publicación en `ambientes.json` y un solo comando para armar y publicar; franja «PRUEBAS» y aviso «KETTAI se muda», los dos apagados.
- Base de datos y función de la IA: sin cambios. Las dos direcciones usan la base actual.
- Cloudflare: sitio nuevo `kettai-app` para la app, aparte del de la página.

**Notas para quien siga el trabajo**

- Los datos de cada persona viven en su teléfono y por dirección: al pasar a la dirección nueva no viajan solos, vuelven desde el respaldo de la cuenta. Nada se borra en la dirección antigua.
- Al 13 de noviembre solo 2 cuentas tienen correo, y las dos son de Rodrigo. Las demás son anónimas: sin cuenta, sus datos no se pueden llevar a la dirección nueva.
- Falta: encender el aviso de mudanza en GitHub (`mudanza` en `ambientes.json`), y después crear el proyecto de Supabase de pruebas y pasar GitHub a `papel: pruebas` con su archivo de claves.
- Vuelta atrás: se puede volver a la 1.1.0 sin cuidado especial; no hay cambios de datos.

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
