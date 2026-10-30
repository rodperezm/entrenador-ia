-- Respaldo en la nube. Cada dato del teléfono (perfil, semana, rutina, sesión,
-- medida o pliegue) se guarda como un documento, validado en la app con zod.
-- Así la app funciona sin internet y sincroniza dato por dato cuando puede.

create table public.user_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('profile','week','plan','session','tape','fold')),
  item_id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

alter table public.user_items enable row level security;

create policy "own rows" on public.user_items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_items to authenticated;

-- Borra la cuenta y, por la cascada, todos sus datos en la nube.
create function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
