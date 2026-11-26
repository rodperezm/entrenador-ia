@AGENTS.md

# Notas para Claude Code

El dueño (Rodrigo) es ingeniero civil industrial, no programador: explica en español, tuteando,
directo y sin jerga (o explicándola). Las decisiones y el historial de cambios están en `VERSIONES.md`.

## Banco de pruebas de la IA (desde 26-11-2026)

Personas simuladas que entrenan varias semanas para medir la calidad y la seguridad de las semanas
que arma Claude. Todo está en `tools/banco/` (ver `tools/banco/LEEME.md`: qué hace y cómo correrlo).
Resultados y decisiones de cada corrida: `docs/banco-resultados.md`.

Decisiones que no hay que volver a discutir:

- **Corre en el proyecto Supabase de pruebas** `kettai-pruebas` (función `bench-claude`), nunca en
  producción. Usa el mismo secreto `ANTHROPIC_API_KEY`; la clave nunca sale de Supabase.
- **Presupuesto**: máximo USD 80 del crédito de la API (crédito promocional, vence el 12-12-2026);
  los otros 20 son para Rodrigo. La función tiene un tope duro (`BENCH_CAP_USD`, por defecto 80) y
  lleva el gasto en la tabla `bench_batches`. Pregunta antes de subir el tope.
- **Fidelidad**: el banco importa las instrucciones, el esquema y la limpieza de
  `supabase/functions/generate-plan/prompt.ts`, y usa el mismo modelo que producción
  (`claude-sonnet-5-5`). Un cambio en `prompt.ts` se prueba en el banco SIN publicar la función.
  Publicar `generate-plan` en producción es una decisión de Rodrigo.
- **Lotes**: el banco usa la API por lotes (mitad de precio). La única diferencia con producción es
  que en lote no existe el respaldo automático ante rechazos (`fallbacks`).
- El juez es Claude Opus 5.5 con una rúbrica fija (`tools/banco/judge.ts`). Las notas del revisor de
  reglas (`src/aiCases/review.ts` + `tools/banco/checks.ts`) son exactas y gratis; el juez cubre lo
  que las reglas no ven.
- Desde la nube de Claude, Node necesita `NODE_USE_ENV_PROXY=1` para salir por el proxy.
