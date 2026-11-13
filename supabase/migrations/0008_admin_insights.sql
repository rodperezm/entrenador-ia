-- Medir resultados, no solo uso. Para el panel:
--   - qué ejercicios acumulan dolor, molestia o «No puedo hacerlo» (y por qué motivo);
--   - cuántas personas pasan cada etapa del inicio: cuenta, perfil, semana armada,
--     primera sesión y vuelta en una segunda semana.
--
-- Sale de las sesiones respaldadas en la nube, así que solo cuenta a quienes tienen cuenta con
-- respaldo activo. Devuelve totales por ejercicio, nunca datos de una persona.

begin;

create function public.admin_insights(days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  window_days integer := least(greatest(coalesce(days, 90), 7), 365);
  since timestamptz := now() - make_interval(days => window_days);
  result jsonb;
begin
  perform public.require_admin();
  with
  ses as (
    select i.user_id, i.item_id, i.data
    from public.user_items i
    where i.kind = 'session' and not i.deleted and i.data ? 'finishedAt'
      and (i.data ->> 'finishedAt')::timestamptz >= since
  ),
  -- Una fila por sesión y ejercicio, con el peor dolor marcado en sus series.
  -- Los registros antiguos solo tenían «dolor» sí o no: cuenta como moderado.
  por_ejercicio as (
    select s.user_id, s.item_id, l ->> 'exerciseId' as ex,
           max(coalesce((l ->> 'painLevel')::integer,
                        case when coalesce((l ->> 'painFlag')::boolean, false) then 2 else 0 end)) as dolor
    from ses s, jsonb_array_elements(coalesce(s.data -> 'sets', '[]'::jsonb)) l
    where l ? 'exerciseId'
    group by 1, 2, 3
  ),
  dolor as (
    select ex,
           count(*)::integer as sesiones,
           count(distinct user_id)::integer as personas,
           (count(*) filter (where dolor >= 2))::integer as con_dolor,
           (count(*) filter (where dolor = 1))::integer as con_molestia
    from por_ejercicio
    group by ex
  ),
  no_puedo as (
    select c ->> 'exerciseId' as ex,
           count(*)::integer as veces,
           (count(*) filter (where c ->> 'reason' = 'dont_know'))::integer as no_conoce,
           (count(*) filter (where c ->> 'reason' = 'too_hard'))::integer as muy_dificil,
           (count(*) filter (where c ->> 'reason' = 'not_safe'))::integer as inseguro,
           (count(*) filter (where c ->> 'reason' = 'no_place'))::integer as sin_lugar
    from ses s, jsonb_array_elements(coalesce(s.data -> 'cantDo', '[]'::jsonb)) c
    where c ? 'exerciseId'
    group by 1
  ),
  junto as (
    select coalesce(d.ex, n.ex) as id,
           coalesce(d.sesiones, 0) as sesiones,
           coalesce(d.personas, 0) as personas,
           coalesce(d.con_dolor, 0) as con_dolor,
           coalesce(d.con_molestia, 0) as con_molestia,
           coalesce(n.veces, 0) as no_puedo,
           coalesce(n.no_conoce, 0) as no_conoce,
           coalesce(n.muy_dificil, 0) as muy_dificil,
           coalesce(n.inseguro, 0) as inseguro,
           coalesce(n.sin_lugar, 0) as sin_lugar
    from dolor d full join no_puedo n on n.ex = d.ex
  ),
  senales as (
    select * from junto
    where con_dolor + con_molestia + no_puedo > 0
    order by con_dolor * 3 + no_puedo * 2 + con_molestia desc, sesiones desc
    limit 40
  ),
  -- Embudo del inicio, de siempre (no solo la ventana): personas con correo.
  cuentas as (
    select u.id from auth.users u
    where u.email is not null and coalesce(u.is_anonymous, false) = false
  ),
  con_perfil as (
    select distinct i.user_id from public.user_items i join cuentas c on c.id = i.user_id
    where i.kind = 'profile' and not i.deleted
  ),
  con_semana as (
    select distinct i.user_id from public.user_items i join cuentas c on c.id = i.user_id
    where i.kind = 'plan' and not i.deleted
  ),
  semanas as (
    select i.user_id, count(distinct date_trunc('week', (i.data ->> 'finishedAt')::timestamptz)) as n
    from public.user_items i join cuentas c on c.id = i.user_id
    where i.kind = 'session' and not i.deleted and i.data ? 'finishedAt'
    group by i.user_id
  )
  select jsonb_build_object(
    'days', window_days,
    'sessions', (select count(*) from ses),
    'people', (select count(distinct user_id) from ses),
    'exercises', coalesce((select jsonb_agg(to_jsonb(s)) from senales s), '[]'::jsonb),
    'funnel', jsonb_build_object(
      'anonymous', (select count(*) from auth.users u where coalesce(u.is_anonymous, false)),
      'accounts', (select count(*) from cuentas),
      'with_profile', (select count(*) from con_perfil),
      'with_week', (select count(*) from con_semana),
      'first_session', (select count(*) from semanas where n >= 1),
      'second_week', (select count(*) from semanas where n >= 2)
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.admin_insights(integer) from public, anon;
grant execute on function public.admin_insights(integer) to authenticated;

commit;
