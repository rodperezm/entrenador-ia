-- Límite de semanas armadas con IA. Cada consulta exitosa queda registrada, y el plan
-- de cada cuenta dice cuántas puede hacer por semana (lunes a domingo, hora de Chile).
-- Sin plan asignado vale el límite por defecto; un límite vacío es sin tope (desarrollador).
-- Las tablas no tienen permisos directos: solo se usan mediante estas funciones.

create table public.ai_generations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ai_generations_user_week on public.ai_generations (user_id, created_at);

create table public.ai_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'prueba',
  weekly_limit integer check (weekly_limit >= 0), -- null = sin tope; 0 = solo reglas de la app
  updated_at timestamptz not null default now()
);

alter table public.ai_generations enable row level security;
alter table public.ai_plans enable row level security;

-- Cuántas consultas lleva esta semana y cuántas puede hacer.
create function public.ai_quota()
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
    coalesce((select weekly_limit from plan), case when exists (select 1 from plan) then null else 1 end),
    exists (select 1 from plan where weekly_limit is null),
    (select inicio + interval '7 days' from semana);
$$;

-- Se llama solo cuando la IA entregó una semana válida.
create function public.record_ai_generation()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_generations (user_id) values (auth.uid());
$$;

revoke execute on function public.ai_quota() from public, anon;
revoke execute on function public.record_ai_generation() from public, anon;
grant execute on function public.ai_quota() to authenticated;
grant execute on function public.record_ai_generation() to authenticated;

-- Cuenta del desarrollador: sin tope.
insert into public.ai_plans (user_id, plan, weekly_limit)
select id, 'desarrollador', null from auth.users where email = 'CORREO_DEL_ADMINISTRADOR'
on conflict (user_id) do update set plan = excluded.plan, weekly_limit = excluded.weekly_limit, updated_at = now();
