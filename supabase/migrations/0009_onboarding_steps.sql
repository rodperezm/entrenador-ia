-- Hasta qué paso del registro llega cada teléfono, para medir dónde abandona la gente.
-- Hasta ahora solo se sabía quién terminaba: la cuenta se pide al principio y lo que pasa antes
-- no dejaba rastro.
--
-- Es anónimo: un identificador al azar que la app genera en cada teléfono, el nombre del paso y
-- la fecha. Sin correo, sin cuenta, sin datos de salud. Una fila por teléfono y paso.
-- La tabla no tiene acceso directo: la app solo agrega mediante «track_onboarding».

begin;

create table public.onboarding_steps (
  device_id uuid not null,
  step text not null,
  created_at timestamptz not null default now(),
  primary key (device_id, step)
);
create index onboarding_steps_recent on public.onboarding_steps (created_at desc);

alter table public.onboarding_steps enable row level security;
revoke all on table public.onboarding_steps from anon, authenticated;

-- Anota que un teléfono llegó a un paso. La puede llamar cualquiera, también sin sesión (la
-- portada se ve antes de crear la cuenta), así que solo acepta pasos conocidos y tiene un tope
-- global por hora: si alguien la llamara en masa, deja de anotar en vez de llenar la tabla.
create function public.track_onboarding(device uuid, step_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if device is null or step_name not in (
    'intro', 'account_form', 'code_requested', 'account_created', 'existing_account',
    'step_welcome', 'step_about', 'step_equipment', 'step_conditions', 'step_week', 'done'
  ) then
    return;
  end if;
  if (select count(*) from public.onboarding_steps where created_at >= now() - interval '1 hour') >= 2000 then
    return;
  end if;
  insert into public.onboarding_steps (device_id, step) values (device, step_name)
  on conflict (device_id, step) do nothing;
end;
$$;

-- Para el panel: de los teléfonos que vieron la portada en el período, cuántos llegaron a cada paso.
-- Los que entraron con «Ya tengo cuenta» no son registros nuevos y van aparte.
create function public.admin_onboarding(days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  window_days integer := least(greatest(coalesce(days, 30), 1), 365);
  result jsonb;
begin
  perform public.require_admin();
  with
  inicio as (
    select device_id from public.onboarding_steps
    where step = 'intro' and created_at >= now() - make_interval(days => window_days)
  ),
  existentes as (
    select distinct o.device_id from public.onboarding_steps o join inicio i on i.device_id = o.device_id
    where o.step = 'existing_account'
  ),
  nuevos as (
    select device_id from inicio where device_id not in (select device_id from existentes)
  )
  select jsonb_build_object(
    'days', window_days,
    'devices', (select count(*) from nuevos),
    'existing', (select count(*) from existentes),
    'since', (select min(created_at) from public.onboarding_steps),
    'steps', coalesce((
      select jsonb_object_agg(step, n) from (
        select o.step, count(*) as n
        from public.onboarding_steps o join nuevos nv on nv.device_id = o.device_id
        group by o.step
      ) t), '{}'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.track_onboarding(uuid, text) from public;
grant execute on function public.track_onboarding(uuid, text) to anon, authenticated;
revoke execute on function public.admin_onboarding(integer) from public, anon;
grant execute on function public.admin_onboarding(integer) to authenticated;

commit;
