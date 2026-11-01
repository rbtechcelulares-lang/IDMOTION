-- Cole tudo no SQL Editor do Supabase (nuvem) e clique em Run. Gerado a partir de supabase/migrations.
-- ID MOTION: schema inicial. Acesso apenas via service role (RLS ligado, sem policies).

create table if not exists app_auth (
  id smallint primary key default 1 check (id = 1), -- uma única linha, para sempre
  username text not null default 'IDMOTION',
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists login_attempts (
  ip text primary key,
  failures int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text not null check (format in ('9:16','16:9','1:1','4:5')),
  objective text not null default '',
  style text not null check (style in ('cinematic','viral','premium')),
  instructions text not null default '',
  status text not null default 'created', -- created|uploaded|analyzing|ready|rendering|done|error
  source_path text,
  music_path text,
  source_meta jsonb,
  analysis jsonb,
  current_version int,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_updated_idx on projects (updated_at desc);

create table if not exists edl_versions (
  id bigserial primary key,
  project_id uuid not null references projects(id) on delete cascade,
  version int not null,
  parent_version int,
  edl jsonb not null,
  source text not null, -- director|chat|manual
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table if not exists chat_messages (
  id bigserial primary key,
  project_id uuid not null references projects(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  edl_version int,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  type text not null check (type in ('analyze','render')),
  status text not null default 'queued', -- queued|running|done|error|cancelled
  progress real not null default 0,
  stage text not null default '',
  attempts int not null default 0,
  max_attempts int not null default 3, -- 1 tentativa + 2 retries
  cancel_requested boolean not null default false,
  edl_version int,
  output_path text,
  qc jsonb,
  error text,
  worker_id text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists jobs_queue_idx on jobs (status, created_at);

create table if not exists tts_cache (
  hash text primary key,
  path text not null,
  created_at timestamptz not null default now()
);

alter table app_auth enable row level security;
alter table login_attempts enable row level security;
alter table projects enable row level security;
alter table edl_versions enable row level security;
alter table chat_messages enable row level security;
alter table jobs enable row level security;
alter table tts_cache enable row level security;

-- Worker pega o próximo job de forma atômica.
create or replace function claim_job(p_worker text)
returns setof jobs
language plpgsql
security definer
set search_path = public
as $$
declare j jobs;
begin
  select * into j from jobs
   where status = 'queued'
   order by created_at
   for update skip locked
   limit 1;
  if not found then return; end if;
  update jobs set status = 'running', attempts = attempts + 1, worker_id = p_worker,
         started_at = now(), error = null
   where id = j.id returning * into j;
  return next j;
end $$;
revoke all on function claim_job(text) from public, anon, authenticated;
grant execute on function claim_job(text) to service_role;
-- Bucket privado para vídeos, trilhas, frames, renders e narração (modo STORAGE=supabase).
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;
-- Retenção: arquivos de vídeo são apagados após RETENTION_DAYS (padrão 2) sem atividade.
alter table projects add column if not exists files_deleted_at timestamptz;
