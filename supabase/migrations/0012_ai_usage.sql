-- Gasto real de la IA. Hasta ahora la función generate-plan recibía de Claude el modelo y los
-- tokens de cada consulta y los descartaba: el costo del panel era un valor fijo por semana.
--
-- 1. Cada fila de ai_generations guarda el modelo que respondió y sus tokens (entrada, salida y
--    caché, que se cobran distinto). Las filas anteriores quedan con esos datos vacíos.
-- 2. Una consulta en que Claude respondió pero la respuesta no sirvió (se cortó, se negó o llegó
--    con un formato roto) ya no se borra: queda marcada como fallida, con su gasto, y no cuenta
--    para el cupo de la persona. Si Claude no alcanzó a responder, no hubo gasto y la fila se
--    sigue borrando como antes (release_ai_generation).
-- 3. El cupo semanal (ai_quota) cuenta solo las consultas que no fallaron. El tope diario global
--    no cambia: sigue contando todas, porque su objetivo es limitar el gasto total.
--
-- Todo en una transacción: si algo falla, no queda nada a medias.

begin;

alter table public.ai_generations
  add column model text,
  add column input_tokens integer,
  add column output_tokens integer,
  add column cache_read_tokens integer,
  add column cache_write_tokens integer,
  add column failed boolean not null default false;

-- Anota el gasto en una reserva. Solo la puede llamar el servidor (la función de IA), igual que
-- release_ai_generation: si la pudiera llamar la app, cualquiera marcaría su consulta como fallida
-- para recuperar el cupo.
create function public.record_ai_usage(
  generation bigint,
  used_model text,
  tokens_in integer,
  tokens_out integer,
  cache_read integer,
  cache_write integer,
  is_failed boolean
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_generations
  set model = used_model,
      input_tokens = tokens_in,
      output_tokens = tokens_out,
      cache_read_tokens = cache_read,
      cache_write_tokens = cache_write,
      failed = coalesce(is_failed, false)
  where id = generation and created_at >= now() - interval '15 minutes';
$$;

revoke execute on function public.record_ai_usage(bigint, text, integer, integer, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.record_ai_usage(bigint, text, integer, integer, integer, integer, boolean)
  to service_role;

-- Igual que en 0004, salvo que las consultas fallidas no cuentan para el cupo.
create or replace function public.ai_quota()
returns table (used integer, weekly_limit integer, unlimited boolean, resets_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with semana as (
    select (date_trunc('week', now() at time zone 'America/Santiago') at time zone 'America/Santiago') as inicio
  ),
  plan as (
    select p.weekly_limit, true as asignado from public.ai_plans p where p.user_id = auth.uid()
  )
  select
    (select count(*)::integer from public.ai_generations g, semana
      where g.user_id = auth.uid() and g.created_at >= semana.inicio and not g.failed),
    coalesce(
      (select weekly_limit from plan),
      case when exists (select 1 from plan) then null
           else coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'default_weekly_limit'), 1)
      end),
    exists (select 1 from plan where weekly_limit is null),
    (select inicio + interval '7 days' from semana);
$$;

commit;
