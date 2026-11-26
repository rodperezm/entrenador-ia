-- Tabla del banco de pruebas. Va SOLO en el proyecto de pruebas (kettai-pruebas), no en producción.
-- Un registro por lote enviado a Claude: lo estimado al enviarlo y lo real al recibir las respuestas.
create table if not exists public.bench_batches (
  id text primary key,
  run text not null default '',
  n integer not null,
  estimate_usd numeric not null,
  actual_usd numeric,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
-- Sin políticas: solo la clave del servidor (la función) puede leerla o escribirla.
alter table public.bench_batches enable row level security;
grant select, insert, update on public.bench_batches to service_role;
