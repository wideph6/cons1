-- ============================================================
--  New M — a second file manager over the same domains
--
--  This is the New M part of schema.sql on its own, so it can be run
--  without re-sending the whole file. Safe to re-run.
--
--  Supabase -> SQL Editor -> New query -> paste -> Run
--  Requires public.users and public.domains to exist already (schema.sql).
-- ============================================================

-- ---------- Links (a path under a domain, works like a folder) ----------
-- Kept apart from Old M's links, so the two managers never share a folder and the public
-- download route, which reads only Old M's tables, never serves a New M file.
create table if not exists public.new_m_links (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.domains(id) on delete cascade,
  path text not null default '',          -- 'reports/2025' ; '' = domain root
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (domain_id, path)
);

-- ---------- Files (stored in Cloudflare R2 under new-m/, referenced by key) ----------
create table if not exists public.new_m_files (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.new_m_links(id) on delete cascade,
  filename text not null,
  r2_key text not null unique,
  size bigint not null default 0,
  content_type text not null default 'application/pdf',
  uploaded_by uuid references public.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),   -- bumps on rename / replace
  replaced_at timestamptz,
  renamed_at timestamptz,
  download_count bigint not null default 0,
  last_downloaded_at timestamptz,
  unique (link_id, filename)
);

create index if not exists new_m_files_link_idx on public.new_m_files(link_id);
create index if not exists new_m_files_uploaded_at_idx on public.new_m_files(uploaded_at desc);
create index if not exists new_m_links_domain_idx on public.new_m_links(domain_id);

create or replace view public.new_m_links_view as
select
  l.*,
  coalesce(f.file_count, 0)::int    as file_count,
  coalesce(f.total_size, 0)::bigint as total_size,
  f.last_upload_at
from public.new_m_links l
left join (
  select link_id, count(*) as file_count, sum(size) as total_size, max(uploaded_at) as last_upload_at
  from public.new_m_files
  group by link_id
) f on f.link_id = l.id;

-- Every domain starts with a root link, as it does in Old M. Domains added later get theirs
-- when they are created; re-running this brings back a root link that was deleted.
insert into public.new_m_links (domain_id, path)
select id, '' from public.domains
on conflict (domain_id, path) do nothing;

-- ---------- Lock down ----------
-- Only the server (service_role key) talks to the database. Block anon/authenticated keys.
alter table public.new_m_links enable row level security;
alter table public.new_m_files enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
