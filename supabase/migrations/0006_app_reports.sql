-- Reportes de la app: errores que ocurren en el teléfono de alguien y comentarios que la persona
-- envía. Hasta ahora, si la app fallaba, nadie se enteraba.
--
-- La tabla no tiene acceso directo: la app solo puede agregar mediante «send_report», que limita
-- cuántos acepta por cuenta, y solo los administradores pueden leerlos, desde el panel.
-- Un reporte no lleva datos de salud: solo el mensaje, la pantalla, la versión y el tipo de equipo.
--
-- Todo en una transacción: si algo falla, no queda nada a medias.

begin;

create table public.app_reports (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('error', 'feedback')),
  message text not null check (char_length(message) between 1 and 4000),
  context jsonb not null default '{}'::jsonb check (octet_length(context::text) <= 4000),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index app_reports_recent on public.app_reports (created_at desc);
create index app_reports_user on public.app_reports (user_id, created_at);

alter table public.app_reports enable row level security;
-- Sin permisos directos sobre la tabla: además de no tener políticas, ni siquiera queda expuesta.
revoke all on table public.app_reports from anon, authenticated;

-- Guarda un reporte. Máximo 30 por cuenta por hora: un error que se repite no llena la tabla.
-- Responde false si no lo guardó, sin fallar: reportar nunca debe romper la app.
create function public.send_report(report_kind text, report_message text, report_context jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if auth.uid() is null then
    return false;
  end if;
  if report_kind not in ('error', 'feedback') or report_message is null or btrim(report_message) = '' then
    return false;
  end if;
  select count(*) into recent from public.app_reports r
   where r.user_id = auth.uid() and r.created_at >= now() - interval '1 hour';
  if recent >= 30 then
    return false;
  end if;
  insert into public.app_reports (user_id, kind, message, context)
  values (
    auth.uid(),
    report_kind,
    left(btrim(report_message), 4000),
    case when octet_length(coalesce(report_context, '{}'::jsonb)::text) <= 4000
         then coalesce(report_context, '{}'::jsonb) else '{}'::jsonb end);
  return true;
end;
$$;

-- Los últimos reportes, para el panel. Con el correo si la cuenta lo tiene.
create function public.admin_reports(max_rows integer default 200)
returns table (
  id bigint,
  kind text,
  message text,
  context jsonb,
  resolved boolean,
  created_at timestamptz,
  email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select r.id, r.kind, r.message, r.context, r.resolved, r.created_at, u.email::text
  from public.app_reports r
  left join auth.users u on u.id = r.user_id
  order by r.created_at desc
  limit least(greatest(coalesce(max_rows, 200), 1), 500);
end;
$$;

-- Marcar un reporte como revisado (o volver a abrirlo).
create function public.admin_resolve_report(report_id bigint, is_resolved boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.app_reports set resolved = is_resolved where id = report_id;
end;
$$;

revoke execute on function public.send_report(text, text, jsonb),
  public.admin_reports(integer), public.admin_resolve_report(bigint, boolean) from public, anon;
grant execute on function public.send_report(text, text, jsonb),
  public.admin_reports(integer), public.admin_resolve_report(bigint, boolean) to authenticated;

commit;
