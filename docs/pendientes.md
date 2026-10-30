# KettleIA · Ayuda memoria (27-10-2026)

## Lo que quedó listo hoy
- Mapa muscular anatómico (hombre/mujer según el perfil), ícono y nombre **KettleIA**.
- Versión web para amigos: https://rodperezm.github.io/entrenador-ia/ · código en https://github.com/rodperezm/entrenador-ia
- Pantalla del día: rutina arriba, fecha, panel «Rehacer o ajustar este día» (se guarda solo al confirmar).
- Semana vacía → ofrece «Generar mi semana con IA» o «Armar solo este día».
- Casa o parque cambia el equipamiento (pregunta «¿qué hay en tu parque?»).
- Tiempo disponible por día y cantidad de ejercicios por parte.
- Escalas de esfuerzo (repeticiones / aguante / ninguna según el ejercicio) y dolor en 4 niveles.
- Botón «Borrar mis datos y empezar de cero».
- Filtro «Kettlebell» en Ejercicios.
- Cotizaciones de animaciones enviadas a Gymvisual y WorkoutLabs (respuestas llegarán a tu Gmail).

## Pendiente de publicar (está en el PC, no en el link ni en Supabase)
- [ ] Subir a GitHub y publicar la web: pregunta de esfuerzo por tipo + filtro Kettlebell.
- [ ] Actualizar la función de IA en Supabase (reglas: movilidad no sube, ejercicios por tiempo +5 s).

## Plan para seguir (en este orden)
1. **Entrenamiento guiado** (lo más importante: registrar no debe costar más que entrenar)
   - Un ejercicio a la vez: «Ahora: Peso muerto · Serie 1 de 2 · 8 reps · 12 kg» + botón grande **✓ Hecha**.
   - «Ajustar» pequeño para cambiar reps/kg.
   - Esfuerzo una sola vez por ejercicio (al terminar su última serie); dolor en un «¿Algo dolió?» plegado.
   - Descanso automático y paso al siguiente ejercicio; calentamiento y elongación con un solo «✓ Hecho».
   - «Ver todos» para cambiar el orden. Meta: ~25 toques por día (hoy 35–80).
2. **Tarjeta «Hoy»** arriba en Mi semana (qué toca hoy o el próximo entrenamiento + «Empezar»); si la semana está vacía, el botón de generarla arriba.
3. **Perfil más corto**
   - Sexo obligatorio (se usa para las figuras y el mapa muscular).
   - Fecha de nacimiento y altura opcionales («Completar después», se piden al entrar a Cuerpo).
   - «Tu semana» parte en «Propónmelo tú» (solo cuántos días).
   - Último botón «Crear mi semana» que la arma de una vez.
4. **Variedad entre semanas**: ciclos de 4 semanas (principales fijos, complementarios rotan) y ampliar el catálogo de kettlebell en ~20–25 ejercicios (sentadilla, empuje horizontal, core, snatch, etc.).
5. **Animaciones**: comparar las cotizaciones y elegir proveedor.
6. Más adelante (para tiendas): cuentas reales, datos en Supabase, límites de IA, parte legal, Apple/Google.

## Para retomar
- Arrancar el servidor: `$env:NODE_OPTIONS='--max-old-space-size=3072'; npx expo start` en `C:\dev\entrenador-ia`.
- En el iPhone: Expo Go → entrenador-ia (o `exp://192.168.1.106:8081`).
- Comentarios con pantallazos: chat de WhatsApp «@rodrigo_perez_morales (Tú)».
