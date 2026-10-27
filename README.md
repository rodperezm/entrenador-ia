# KettleIA

App móvil de entrenamiento con kettlebell (Expo + React Native + TypeScript).

## Ver la app en tu celular

1. Instala **Expo Go** en el teléfono (App Store / Google Play).
2. En esta carpeta ejecuta:

   ```bash
   npx expo start
   ```

3. Escanea el código QR con la cámara (iPhone) o con Expo Go (Android). Computador y celular deben estar en la misma red Wi-Fi.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/app/` | Pantallas (Expo Router): lista de ejercicios y ficha de ejercicio |
| `src/components/BodyMap.tsx` | Mapa corporal (heatmap) en SVG; las regiones usan los IDs de músculo |
| `src/domain/catalog.ts` | Catálogos cerrados: músculos, equipamiento, restricciones, condiciones médicas |
| `src/domain/schema.ts` | Modelo de datos con `zod` (Exercise, perfil, plan semanal, historial) |
| `src/domain/filter.ts` | Pre-filtro de ejercicios por equipamiento y restricciones (antes del LLM) |
| `src/data/exercises.seed.ts` | Catálogo inicial de ejercicios |
| `supabase/migrations/` | Esquema de la base de datos con RLS |
| `scripts/export-seed.ts` | Valida el catálogo y genera `supabase/seed.sql` |

## Comandos

```bash
npm run seed        # valida el catálogo y regenera supabase/seed.sql
npm run typecheck   # verificación de tipos
npx expo lint       # linter
```

## Ilustraciones

Cada ejercicio espera sus recursos en `exercises/<id>/`: `thumb.webp`, `anim.json` (Lottie) y `step_N.webp`.
Mientras `media.status` sea `placeholder`, la ficha muestra un recuadro "Animación pendiente".
Para el mapa corporal definitivo, el ilustrador debe entregar un SVG cuyas regiones usen los IDs de `MUSCLES` en `catalog.ts`.
