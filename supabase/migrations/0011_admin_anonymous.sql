-- Desglose de las cuentas anónimas para el panel. Cada teléfono o navegador nuevo crea una,
-- así que el total sobrestima a las personas. Aquí se separan las que dejaron alguna huella
-- en la base (pidieron un plan a la IA, enviaron un comentario o respaldaron algo) de las que
-- solo abrieron la app. Lo que hacen sin respaldo queda en su teléfono y no se ve.
-- Devuelve solo totales, nunca datos de una persona.

begin;

create function public.admin_anonymous()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_admin();
  with
  anon as (
    select u.id, u.created_at from auth.users u where coalesce(u.is_anonymous, false)
  ),
  huella as (
    select user_id from public.ai_generations
    union select user_id from public.app_reports
    union select user_id from public.user_items
  )
  select jsonb_build_object(
    'total', (select count(*) from anon),
    'with_activity', (select count(*) from anon a join huella h on h.user_id = a.id),
    'with_ai', (select count(distinct g.user_id) from public.ai_generations g join anon a on a.id = g.user_id),
    'new_7d', (select count(*) from anon where created_at >= now() - interval '7 days')
  ) into result;
  return result;
end;
$$;

revoke execute on function public.admin_anonymous() from public, anon;
grant execute on function public.admin_anonymous() to authenticated;

commit;
