-- Panel de control (kettaiapp.com/Panel). Solo los administradores pueden usarlo: cada función
-- revisa primero que quien llama esté en «admins»; si no, falla. Las tablas no tienen acceso
-- directo desde la app ni desde el panel, solo mediante estas funciones.
-- Todo en una transacción: si algo falla, no queda nada a medias.

begin;

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;

insert into public.admins (user_id)
select id from auth.users where email = 'CORREO_DEL_ADMINISTRADOR'
on conflict do nothing;

-- Valores que se ajustan desde el panel sin tocar código.
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

insert into public.app_settings (key, value) values
  ('default_weekly_limit', '1'),   -- con cuántas semanas con IA parte una cuenta nueva
  ('ai_cost_usd', '0.15'),         -- costo medido de una semana armada con IA (Sonnet)
  ('usd_to_clp', '950')            -- tipo de cambio para comparar precios y costos
on conflict (key) do nothing;

-- Precio mensual de cada plan, según cuántas semanas con IA puede armar por semana.
-- 1 a la semana son 4 al mes; 5 a la semana, 20 al mes. 0 es el plan gratis (solo reglas).
create table public.plan_prices (
  weekly_limit integer primary key check (weekly_limit between 0 and 5),
  price_clp integer check (price_clp >= 0),
  price_usd numeric(10, 2) check (price_usd >= 0),
  updated_at timestamptz not null default now()
);
alter table public.plan_prices enable row level security;

insert into public.plan_prices (weekly_limit, price_clp, price_usd)
select n, case when n = 0 then 0 end, case when n = 0 then 0 end from generate_series(0, 5) n
on conflict (weekly_limit) do nothing;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo administradores' using errcode = '42501';
  end if;
end;
$$;

-- Límite por defecto desde los ajustes (antes era 1 fijo). Lo demás queda igual.
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
      where g.user_id = auth.uid() and g.created_at >= semana.inicio),
    coalesce(
      (select weekly_limit from plan),
      case when exists (select 1 from plan) then null
           else coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'default_weekly_limit'), 1)
      end),
    exists (select 1 from plan where weekly_limit is null),
    (select inicio + interval '7 days' from semana);
$$;

-- Usuarios con correo, su plan y su uso.
create function public.admin_users()
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  has_plan boolean,
  weekly_limit integer,
  unlimited boolean,
  is_admin boolean,
  used_week integer,
  used_month integer,
  sessions_30d integer,
  sessions_total integer,
  last_session timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  with semana as (
    select (date_trunc('week', now() at time zone 'America/Santiago') at time zone 'America/Santiago') as inicio
  ),
  ses as (
    select i.user_id, (i.data ->> 'finishedAt')::timestamptz as fin
    from public.user_items i
    where i.kind = 'session' and not i.deleted and i.data ? 'finishedAt'
  )
  select
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    p.user_id is not null,
    p.weekly_limit,
    p.user_id is not null and p.weekly_limit is null,
    exists (select 1 from public.admins a where a.user_id = u.id),
    (select count(*)::integer from public.ai_generations g, semana where g.user_id = u.id and g.created_at >= semana.inicio),
    (select count(*)::integer from public.ai_generations g where g.user_id = u.id and g.created_at >= now() - interval '30 days'),
    (select count(*)::integer from ses where ses.user_id = u.id and ses.fin >= now() - interval '30 days'),
    (select count(*)::integer from ses where ses.user_id = u.id),
    (select max(ses.fin) from ses where ses.user_id = u.id)
  from auth.users u
  left join public.ai_plans p on p.user_id = u.id
  where u.email is not null and coalesce(u.is_anonymous, false) = false
  order by u.created_at desc;
end;
$$;

-- Cambiar cuántas semanas con IA puede armar una cuenta: 0 a 5, sin límite, o volver al valor por defecto.
create function public.admin_set_limit(target uuid, new_limit integer, no_limit boolean default false, use_default boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if use_default then
    delete from public.ai_plans where user_id = target;
    return;
  end if;
  if not no_limit and (new_limit is null or new_limit < 0 or new_limit > 5) then
    raise exception 'El límite debe ser de 0 a 5 por semana';
  end if;
  insert into public.ai_plans (user_id, plan, weekly_limit, updated_at)
  values (
    target,
    case when no_limit then 'sin_limite' when new_limit = 0 then 'gratis' else 'ia_' || new_limit end,
    case when no_limit then null else new_limit end,
    now())
  on conflict (user_id) do update
    set plan = excluded.plan, weekly_limit = excluded.weekly_limit, updated_at = now();
end;
$$;

create function public.admin_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'settings', (select jsonb_object_agg(key, value) from public.app_settings),
    'prices', (select jsonb_agg(jsonb_build_object('weekly_limit', weekly_limit, 'price_clp', price_clp, 'price_usd', price_usd)
                                order by weekly_limit) from public.plan_prices));
end;
$$;

create function public.admin_set_price(tier integer, clp integer, usd numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.plan_prices set price_clp = clp, price_usd = usd, updated_at = now() where weekly_limit = tier;
end;
$$;

create function public.admin_set_setting(setting text, new_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if setting not in ('default_weekly_limit', 'ai_cost_usd', 'usd_to_clp') then
    raise exception 'Ajuste desconocido';
  end if;
  if setting = 'default_weekly_limit' and ((new_value #>> '{}')::integer not between 0 and 5) then
    raise exception 'El valor por defecto debe ser de 0 a 5';
  end if;
  update public.app_settings set value = new_value, updated_at = now() where key = setting;
end;
$$;

-- Métricas del dashboard. Las sesiones solo existen en la nube para quienes activaron el respaldo.
create function public.admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  default_limit integer := coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'default_weekly_limit'), 1);
  ai_cost numeric := coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'ai_cost_usd'), 0.15);
  result jsonb;
begin
  perform public.require_admin();
  with
  usuarios as (
    select u.id, u.created_at,
           p.user_id is not null and p.weekly_limit is null as unlimited,
           case when p.user_id is null then default_limit else p.weekly_limit end as lim,
           exists (select 1 from public.admins a where a.user_id = u.id) as admin
    from auth.users u left join public.ai_plans p on p.user_id = u.id
    where u.email is not null and coalesce(u.is_anonymous, false) = false
  ),
  ses as (
    select i.user_id,
           (i.data ->> 'startedAt')::timestamptz as ini,
           (i.data ->> 'finishedAt')::timestamptz as fin,
           coalesce((i.data ->> 'completed')::boolean, false) as completa,
           i.data ->> 'feeling' as feeling,
           exists (select 1 from jsonb_array_elements(i.data -> 'sets') s where coalesce((s ->> 'painLevel')::integer, 0) >= 2) as dolor
    from public.user_items i
    where i.kind = 'session' and not i.deleted and i.data ? 'finishedAt'
  ),
  ses7 as (select * from ses where fin >= now() - interval '7 days'),
  ses30 as (select * from ses where fin >= now() - interval '30 days'),
  pagan as (
    select u.lim, pp.price_clp, pp.price_usd
    from usuarios u join public.plan_prices pp on pp.weekly_limit = u.lim
    where not u.unlimited and not u.admin and u.lim > 0
  ),
  semanas as (
    select generate_series(
      date_trunc('week', now() at time zone 'America/Santiago') - interval '7 weeks',
      date_trunc('week', now() at time zone 'America/Santiago'),
      interval '1 week') as inicio
  )
  select jsonb_build_object(
    'users_total', (select count(*) from usuarios),
    'users_anonymous', (select count(*) from auth.users where coalesce(is_anonymous, false) or email is null),
    'new_7d', (select count(*) from usuarios where created_at >= now() - interval '7 days'),
    'new_30d', (select count(*) from usuarios where created_at >= now() - interval '30 days'),
    'active_7d', (select count(distinct user_id) from ses7),
    'active_30d', (select count(distinct user_id) from ses30),
    'sessions_7d', (select count(*) from ses7),
    'sessions_30d', (select count(*) from ses30),
    'avg_minutes_30d', (select round(avg(extract(epoch from (fin - ini)) / 60)::numeric, 1) from ses30 where fin > ini),
    'completed_pct_30d', (select round(100.0 * avg(case when completa then 1 else 0 end), 0) from ses30),
    'pain_pct_30d', (select round(100.0 * avg(case when dolor then 1 else 0 end), 0) from ses30),
    'feelings_30d', (select coalesce(jsonb_object_agg(feeling, n), '{}'::jsonb)
                     from (select feeling, count(*) n from ses30 where feeling is not null group by feeling) f),
    -- Retención: de quienes se registraron hace al menos 2 (o 4) semanas, cuántos entrenaron esa semana.
    'retention_w2', (select round(100.0 * avg(case when exists (
                        select 1 from ses where ses.user_id = u.id
                          and ses.fin >= u.created_at + interval '7 days' and ses.fin < u.created_at + interval '14 days')
                      then 1 else 0 end), 0)
                     from usuarios u where u.created_at <= now() - interval '14 days' and not u.admin),
    'retention_w4', (select round(100.0 * avg(case when exists (
                        select 1 from ses where ses.user_id = u.id
                          and ses.fin >= u.created_at + interval '21 days' and ses.fin < u.created_at + interval '28 days')
                      then 1 else 0 end), 0)
                     from usuarios u where u.created_at <= now() - interval '28 days' and not u.admin),
    'retention_cohort_w2', (select count(*) from usuarios where created_at <= now() - interval '14 days' and not admin),
    'retention_cohort_w4', (select count(*) from usuarios where created_at <= now() - interval '28 days' and not admin),
    'ai_7d', (select count(*) from public.ai_generations where created_at >= now() - interval '7 days'),
    'ai_30d', (select count(*) from public.ai_generations where created_at >= now() - interval '30 days'),
    'ai_cost_usd_30d', (select round(count(*) * ai_cost, 2) from public.ai_generations where created_at >= now() - interval '30 days'),
    'plans', (select jsonb_object_agg(k, n) from (
                select case when unlimited then 'sin_limite' else lim::text end k, count(*) n
                from usuarios group by 1) t),
    'paying', (select count(*) from pagan where coalesce(price_clp, 0) > 0 or coalesce(price_usd, 0) > 0),
    'mrr_clp', (select coalesce(sum(price_clp), 0) from pagan),
    'mrr_usd', (select coalesce(sum(price_usd), 0) from pagan),
    'weekly', (select jsonb_agg(jsonb_build_object(
                 'week', to_char(s.inicio, 'DD-MM'),
                 'new', (select count(*) from usuarios u
                         where u.created_at at time zone 'America/Santiago' >= s.inicio
                           and u.created_at at time zone 'America/Santiago' < s.inicio + interval '7 days'),
                 'active', (select count(distinct ses.user_id) from ses
                            where ses.fin at time zone 'America/Santiago' >= s.inicio
                              and ses.fin at time zone 'America/Santiago' < s.inicio + interval '7 days'),
                 'ai', (select count(*) from public.ai_generations g
                        where g.created_at at time zone 'America/Santiago' >= s.inicio
                          and g.created_at at time zone 'America/Santiago' < s.inicio + interval '7 days'))
                 order by s.inicio) from semanas s)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.is_admin(), public.require_admin(), public.admin_users(), public.admin_set_limit(uuid, integer, boolean, boolean),
  public.admin_config(), public.admin_set_price(integer, integer, numeric), public.admin_set_setting(text, jsonb), public.admin_metrics()
  from public, anon;
grant execute on function public.is_admin(), public.admin_users(), public.admin_set_limit(uuid, integer, boolean, boolean),
  public.admin_config(), public.admin_set_price(integer, integer, numeric), public.admin_set_setting(text, jsonb), public.admin_metrics()
  to authenticated;

commit;
