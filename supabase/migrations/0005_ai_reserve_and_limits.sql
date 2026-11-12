-- Revisión de seguridad del 12-11-2026.
--
-- 1. Cupo de IA sin carrera: antes la función revisaba el cupo, llamaba a Claude y recién al final
--    anotaba la consulta. Varias consultas al mismo tiempo pasaban todas la revisión y se gastaban
--    varias llamadas con un cupo de una. Ahora el cupo se reserva antes de llamar (una reserva a
--    la vez por cuenta) y se devuelve solo si Claude falló.
-- 2. Tope diario global: las cuentas sin correo son gratis de crear, así que alguien podría crear
--    muchas para gastar consultas. El tope limita el gasto total del día pase lo que pase.
-- 3. Opción de exigir correo para usar la IA (apagada; se enciende desde el panel).
-- 4. Tamaño máximo de cada dato del respaldo, para que una cuenta no pueda llenar la base.
--
-- Todo en una transacción: si algo falla, no queda nada a medias.

begin;

insert into public.app_settings (key, value) values
  ('ai_daily_cap', '300'),          -- máximo de semanas con IA en 24 horas, sumando todas las cuentas
  ('ai_requires_email', 'false')    -- true: solo cuentas con correo pueden usar la IA
on conflict (key) do nothing;

-- Reserva una consulta. Devuelve 'ok' y su id, o el motivo por el que no se puede.
create function public.reserve_ai_generation()
returns table (status text, generation_id bigint, weekly_limit integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  q record;
  daily_cap integer;
  needs_email boolean;
  new_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  -- Una reserva a la vez por cuenta: la segunda espera a que la primera quede anotada.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  select * into q from public.ai_quota();

  needs_email := coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'ai_requires_email'), false);
  if needs_email and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return query select 'needs_account'::text, null::bigint, q.weekly_limit, q.resets_at;
    return;
  end if;

  if not q.unlimited and q.used >= coalesce(q.weekly_limit, 0) then
    return query select 'weekly_limit'::text, null::bigint, q.weekly_limit, q.resets_at;
    return;
  end if;

  daily_cap := coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'ai_daily_cap'), 300);
  if not q.unlimited
     and (select count(*) from public.ai_generations g where g.created_at >= now() - interval '24 hours') >= daily_cap then
    return query select 'daily_cap'::text, null::bigint, q.weekly_limit, q.resets_at;
    return;
  end if;

  insert into public.ai_generations (user_id) values (auth.uid()) returning id into new_id;
  return query select 'ok'::text, new_id, q.weekly_limit, q.resets_at;
end;
$$;

-- Devuelve una reserva cuando Claude falló. Solo la puede llamar el servidor (la función de IA):
-- si la pudiera llamar la app, cualquiera se devolvería su propio cupo después de usarlo.
create function public.release_ai_generation(generation bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.ai_generations
  where id = generation and created_at >= now() - interval '15 minutes';
$$;

revoke execute on function public.reserve_ai_generation() from public, anon;
grant execute on function public.reserve_ai_generation() to authenticated;
revoke execute on function public.release_ai_generation(bigint) from public, anon, authenticated;
grant execute on function public.release_ai_generation(bigint) to service_role;

-- «record_ai_generation» queda como está: la función de IA publicada hoy todavía la usa, y quitarla
-- antes de publicar la nueva dejaría las consultas sin anotar. Solo suma al cupo de quien la llama.

-- Los dos ajustes nuevos se pueden cambiar desde el panel.
create or replace function public.admin_set_setting(setting text, new_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if setting not in ('default_weekly_limit', 'ai_cost_usd', 'usd_to_clp', 'ai_daily_cap', 'ai_requires_email') then
    raise exception 'Ajuste desconocido';
  end if;
  if setting = 'default_weekly_limit' and ((new_value #>> '{}')::integer not between 0 and 5) then
    raise exception 'El valor por defecto debe ser de 0 a 5';
  end if;
  if setting = 'ai_daily_cap' and ((new_value #>> '{}')::integer not between 0 and 100000) then
    raise exception 'El tope diario debe ser de 0 a 100000';
  end if;
  if setting = 'ai_requires_email' and jsonb_typeof(new_value) <> 'boolean' then
    raise exception 'Debe ser verdadero o falso';
  end if;
  if setting in ('ai_cost_usd', 'usd_to_clp') and ((new_value #>> '{}')::numeric < 0) then
    raise exception 'El valor no puede ser negativo';
  end if;
  update public.app_settings set value = new_value, updated_at = now() where key = setting;
end;
$$;

-- Respaldo: cada dato pesa como máximo 1 MB y su identificador es corto. Una semana completa
-- pesa menos de 200 KB y una sesión, unos pocos. «not valid» no revisa las filas que ya existen.
alter table public.user_items
  add constraint user_items_data_size check (data is null or octet_length(data::text) <= 1048576) not valid,
  add constraint user_items_id_length check (char_length(item_id) <= 100) not valid;

commit;
