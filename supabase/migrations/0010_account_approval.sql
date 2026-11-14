-- Aprobación manual de cuentas, para la etapa de prueba.
--
-- Para usar la app hay que tener cuenta con correo y, mientras el ajuste «approval_required» esté
-- encendido, que el administrador la apruebe desde el panel. El bloqueo vive aquí, en la base: una
-- cuenta sin aprobar no puede usar la IA ni guardar su respaldo, aunque alguien se salte la app.
-- El día que la app se abra al público, el ajuste se apaga desde el panel y todo sigue igual.
--
-- Solo agrega. Quienes ya tenían cuenta con correo quedan aprobados.

begin;

insert into public.app_settings (key, value) values ('approval_required', 'true')
on conflict (key) do nothing;

create table public.approved_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  approved_at timestamptz not null default now(),
  approved_by uuid references auth.users (id) on delete set null
);
alter table public.approved_accounts enable row level security;
revoke all on table public.approved_accounts from anon, authenticated;

insert into public.approved_accounts (user_id)
select id from auth.users where email is not null
on conflict do nothing;

-- ¿La cuenta que llama puede usar la app? Con el ajuste apagado, cualquiera con sesión.
-- Con el ajuste encendido: cuenta con correo y aprobada (los administradores siempre pueden).
create function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'approval_required'), false)
    or public.is_admin()
    or (
      auth.uid() is not null
      and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
      and exists (select 1 from public.approved_accounts a where a.user_id = auth.uid())
    );
$$;

-- Lo que la app necesita saber para mostrar la pantalla que corresponde.
create function public.account_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'required', coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'approval_required'), false),
    'has_email', auth.uid() is not null and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false),
    'approved', public.is_approved()
  );
$$;

-- Respaldo: una cuenta sin aprobar puede leer lo suyo, pero no guardar ni cambiar nada.
create policy "approved accounts insert" on public.user_items
  as restrictive for insert to authenticated
  with check (public.is_approved());
create policy "approved accounts update" on public.user_items
  as restrictive for update to authenticated
  using (true) with check (public.is_approved());

-- IA: igual que en 0005, más la revisión de la aprobación antes de reservar el cupo.
create or replace function public.reserve_ai_generation()
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

  if not public.is_approved() then
    return query select 'needs_approval'::text, null::bigint, q.weekly_limit, q.resets_at;
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

-- Panel: quiénes esperan aprobación, y aprobar o quitar la aprobación.
create function public.admin_pending()
returns table (user_id uuid, email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select u.id, u.email::text, u.created_at
    from auth.users u
    where u.email is not null
      and not exists (select 1 from public.approved_accounts a where a.user_id = u.id)
    order by u.created_at desc;
end;
$$;

create function public.admin_approve(target uuid, ok boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if ok then
    insert into public.approved_accounts (user_id, approved_by) values (target, auth.uid())
    on conflict (user_id) do nothing;
  else
    delete from public.approved_accounts where user_id = target;
  end if;
end;
$$;

-- El interruptor se cambia desde el panel, como los demás ajustes.
create or replace function public.admin_set_setting(setting text, new_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if setting not in ('default_weekly_limit', 'ai_cost_usd', 'usd_to_clp', 'ai_daily_cap', 'ai_requires_email', 'approval_required') then
    raise exception 'Ajuste desconocido';
  end if;
  if setting = 'default_weekly_limit' and ((new_value #>> '{}')::integer not between 0 and 5) then
    raise exception 'El valor por defecto debe ser de 0 a 5';
  end if;
  if setting = 'ai_daily_cap' and ((new_value #>> '{}')::integer not between 0 and 100000) then
    raise exception 'El tope diario debe ser de 0 a 100000';
  end if;
  if setting in ('ai_requires_email', 'approval_required') and jsonb_typeof(new_value) <> 'boolean' then
    raise exception 'Debe ser verdadero o falso';
  end if;
  if setting in ('ai_cost_usd', 'usd_to_clp') and ((new_value #>> '{}')::numeric < 0) then
    raise exception 'El valor no puede ser negativo';
  end if;
  update public.app_settings set value = new_value, updated_at = now() where key = setting;
end;
$$;

revoke execute on function public.is_approved() from public;
grant execute on function public.is_approved() to anon, authenticated;
revoke execute on function public.account_status() from public;
grant execute on function public.account_status() to anon, authenticated;
revoke execute on function public.admin_pending() from public, anon;
grant execute on function public.admin_pending() to authenticated;
revoke execute on function public.admin_approve(uuid, boolean) from public, anon;
grant execute on function public.admin_approve(uuid, boolean) to authenticated;

commit;
