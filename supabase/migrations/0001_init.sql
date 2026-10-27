-- Esquema inicial de Entrenador IA.
-- Las columnas filtrables del ejercicio son columnas reales (con índices);
-- el contenido rico (instrucciones, media, guía KB) va en jsonb y se valida
-- con el esquema zod de src/domain/schema.ts.

-- ===================== Catálogo (lectura pública) =====================

create table public.muscles (
  id text primary key,
  label text not null,
  muscle_group text not null check (muscle_group in ('legs','chest','back','shoulders','arms','core'))
);

create table public.restriction_flags (
  id text primary key,
  label text not null
);

create table public.medical_conditions (
  id text primary key,
  name text not null,
  suggested_flags text[] not null default '{}',
  prehab_exercise_ids text[] not null default '{}'
);

create table public.exercises (
  id text primary key,
  version int not null default 1,
  name jsonb not null,
  description jsonb not null,
  block_types text[] not null,
  muscle_groups text[] not null,
  movement_pattern text not null,
  mechanics text not null,
  laterality text not null,
  complexity_level smallint not null check (complexity_level between 1 and 5),
  impact_level text not null check (impact_level in ('none','low','high')),
  restriction_flags text[] not null default '{}',
  equipment_required text[] not null default '{}',
  equipment_optional text[] not null default '{}',
  anatomy jsonb not null,
  prescription jsonb not null,
  progression_chain_id text,
  progression_step smallint,
  progression jsonb not null,
  media jsonb not null,
  instructions jsonb not null,
  kettlebell_guide jsonb,
  safety_notes jsonb not null default '[]',
  cooldown_stretch_ids text[] not null default '{}',
  tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index exercises_block_types_idx on public.exercises using gin (block_types);
create index exercises_muscle_groups_idx on public.exercises using gin (muscle_groups);
create index exercises_restriction_flags_idx on public.exercises using gin (restriction_flags);
create index exercises_chain_idx on public.exercises (progression_chain_id, progression_step);

-- ===================== Usuario =====================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  level text not null default 'beginner' check (level in ('beginner','intermediate','advanced')),
  equipment text[] not null default '{mat,kettlebell}',
  kettlebell_weights_kg numeric[] not null default '{}',
  sex text check (sex in ('male','female')),
  birth_date date,
  height_cm numeric check (height_cm between 100 and 250),
  disclaimer_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_conditions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  condition_id text not null references public.medical_conditions (id),
  active_flags text[] not null default '{}',
  notes text,
  primary key (user_id, condition_id)
);

create table public.user_exercise_exclusions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  reason text,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- ===================== Planes =====================

create table public.week_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  status text not null default 'active' check (status in ('draft','active','archived')),
  day_configs jsonb not null,          -- lo que el usuario pidió en el planner
  summary text,
  llm_model text,
  llm_input_hash text,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.day_plans (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references public.week_plans (id) on delete cascade,
  day text not null check (day in ('mon','tue','wed','thu','fri','sat','sun')),
  location text not null default 'home' check (location in ('home','park')),
  unique (week_plan_id, day)
);

create table public.exercise_slots (
  id uuid primary key default gen_random_uuid(),
  day_plan_id uuid not null references public.day_plans (id) on delete cascade,
  block_type text not null check (block_type in ('warmup','prehab','main_strength','cooldown')),
  position smallint not null,
  exercise_id text not null references public.exercises (id),
  sets smallint not null,
  reps smallint,
  duration_sec int,
  weight_kg numeric,
  rest_sec int not null default 60,
  rationale text
);

-- ===================== Historial =====================

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_plan_id uuid references public.day_plans (id) on delete set null,
  location text not null default 'home',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  completed boolean not null default true,
  overall_rpe numeric check (overall_rpe between 1 and 10)
);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  set_no smallint not null,
  target_reps smallint,
  reps_done smallint,
  duration_sec int,
  weight_kg numeric,
  rpe numeric check (rpe between 1 and 10),
  pain_flag boolean not null default false,
  logged_at timestamptz not null default now()
);

-- ===================== Bitácora corporal (pestaña Cuerpo) =====================

create table public.tape_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  weight_kg numeric check (weight_kg between 20 and 400),
  chest_cm numeric check (chest_cm between 30 and 250),
  waist_cm numeric check (waist_cm between 30 and 250),
  abdomen_cm numeric check (abdomen_cm between 30 and 250),
  hip_cm numeric check (hip_cm between 30 and 250),
  created_at timestamptz not null default now()
);

-- Pliegues (mm): hasta 3 tomas por sitio, p. ej. {"pecho": [15, 15.4], "abdomen": [25], "muslo": [18]}
create table public.fold_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  sex text not null check (sex in ('male','female')),
  sites jsonb not null,
  created_at timestamptz not null default now()
);

create index tape_records_user_date_idx on public.tape_records (user_id, date desc);
create index fold_records_user_date_idx on public.fold_records (user_id, date desc);

create index set_logs_user_exercise_idx on public.set_logs (user_id, exercise_id, logged_at desc);

-- ===================== Seguridad (RLS) =====================

alter table public.muscles enable row level security;
alter table public.restriction_flags enable row level security;
alter table public.medical_conditions enable row level security;
alter table public.exercises enable row level security;
create policy "catalog read" on public.muscles for select using (true);
create policy "catalog read" on public.restriction_flags for select using (true);
create policy "catalog read" on public.medical_conditions for select using (true);
create policy "catalog read" on public.exercises for select using (true);

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

alter table public.user_conditions enable row level security;
create policy "own rows" on public.user_conditions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.user_exercise_exclusions enable row level security;
create policy "own rows" on public.user_exercise_exclusions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.week_plans enable row level security;
create policy "own rows" on public.week_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.day_plans enable row level security;
create policy "own rows" on public.day_plans for all
  using (exists (select 1 from public.week_plans w where w.id = week_plan_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.week_plans w where w.id = week_plan_id and w.user_id = auth.uid()));

alter table public.exercise_slots enable row level security;
create policy "own rows" on public.exercise_slots for all
  using (exists (select 1 from public.day_plans d join public.week_plans w on w.id = d.week_plan_id
                 where d.id = day_plan_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.day_plans d join public.week_plans w on w.id = d.week_plan_id
                      where d.id = day_plan_id and w.user_id = auth.uid()));

alter table public.workout_sessions enable row level security;
create policy "own rows" on public.workout_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.set_logs enable row level security;
create policy "own rows" on public.set_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.tape_records enable row level security;
create policy "own rows" on public.tape_records for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.fold_records enable row level security;
create policy "own rows" on public.fold_records for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===================== Permisos =====================
-- El proyecto no expone tablas nuevas automáticamente: se otorgan aquí.
-- RLS sigue decidiendo qué filas ve cada usuario.

grant select on public.muscles, public.restriction_flags, public.medical_conditions, public.exercises
  to anon, authenticated;

grant select, insert, update, delete on
  public.profiles, public.user_conditions, public.user_exercise_exclusions,
  public.week_plans, public.day_plans, public.exercise_slots,
  public.workout_sessions, public.set_logs,
  public.tape_records, public.fold_records
  to authenticated;
