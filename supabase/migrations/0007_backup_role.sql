-- Acceso exclusivo para la copia de seguridad que corre en un servidor propio
-- (ver tools/copia/instalar.sh). El plan gratis de Supabase no hace copias automáticas.
--
-- «kettai_backup» puede leer toda la base y no puede modificar ni borrar nada. Se crea sin clave:
-- nadie puede entrar con él hasta que el dueño le ponga una desde el editor SQL
-- (alter role kettai_backup with password '...'), que es lo que pide el instalador.

begin;

-- «bypassrls»: la copia necesita leer todas las filas, también las protegidas por usuario.
create role kettai_backup with login bypassrls nocreatedb nocreaterole connection limit 3;
grant pg_read_all_data to kettai_backup;

-- Lo único que escribe: la fecha de la última copia, para que el panel avise si se detiene.
create function public.backup_heartbeat()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.app_settings (key, value, updated_at)
  values ('last_backup_at', to_jsonb(now()), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
$$;

revoke execute on function public.backup_heartbeat() from public, anon, authenticated;
grant execute on function public.backup_heartbeat() to kettai_backup;

commit;
