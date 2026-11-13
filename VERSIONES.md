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
2. Anotar la versión en este archivo: fecha, qué trae y qué partes toca (app, base de datos, función de la IA).
3. Guardar en Git y marcar la versión: `git tag -a v1.2.0 -m "…"`.
4. Publicar en este orden: base de datos, función de la IA, app.
5. Comprobar en un teléfono que el menú muestra la versión nueva.

## Cómo se vuelve a una versión anterior

- **App:** publicar de nuevo desde la marca de esa versión (`git checkout v1.1.0`, publicar y volver a la rama de trabajo). Los teléfonos la toman en unos 15 minutos.
- **Función de la IA:** volver a publicar en Supabase el archivo `supabase/functions/generate-plan/index.ts` de esa marca.
- **Base de datos:** no se deshace sola. Por eso los cambios de datos siempre agregan y nunca quitan ni renombran: así una app anterior sigue funcionando con la base nueva. Si hay que deshacer un cambio, se escribe una migración nueva.
- **Datos guardados en cada teléfono:** no vuelven atrás. Una versión que cambie su formato de forma incompatible es un cambio «mayor» y se avisa aquí.

La columna «Vuelta atrás» de cada versión dice si se puede volver a la anterior sin más, o qué cuidado pide.

## Historial

### 1.1.0 · 13 de noviembre de 2026

Primera versión con número. Reúne lo publicado hasta esta fecha.

- **App:** Términos y condiciones con aceptación, medición anónima del registro, barra de pestañas y encabezado corregidos en iPhone, etiqueta «HIIT», «Dificultad N de 5» en Ejercicios, guía de medición sin la tabla de referencia, número de versión en el menú.
- **Base de datos:** hasta la migración `0009_onboarding_steps`.
- **Función de la IA:** sin cambios desde la revisión de seguridad del 12 de noviembre.
- **Vuelta atrás:** no hay una versión numerada anterior. Las publicaciones previas están en el historial de Git.

### Antes de la 1.1.0

Sin número de versión. El detalle está en el historial de Git y en `docs/pendientes.md`.
