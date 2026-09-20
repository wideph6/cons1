-- ============================================================
--  PDF Link Manager — Supabase schema
--  Run this whole file once: Supabase -> SQL Editor -> New query -> Run
--  Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Users ----------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  password_hash text not null,
  role text not null default 'admin' check (role in ('superadmin', 'admin')),
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- ---------- Domains / subdomains ----------
create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  hostname text not null unique,
  is_active boolean not null default true,
  notes text not null default '',
  vercel_status jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Links (a path under a domain, works like a folder) ----------
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.domains(id) on delete cascade,
  path text not null default '',          -- 'reports/2025' ; '' = domain root
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (domain_id, path)
);

-- ---------- Files (stored in Cloudflare R2, referenced by key) ----------
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.links(id) on delete cascade,
  filename text not null,                 -- public name, e.g. brochure.pdf
  r2_key text not null unique,            -- object key in R2
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

-- ---------- Activity log (every admin action) ----------
create table if not exists public.activity_log (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete set null,
  action text not null,                   -- upload | replace | rename | delete | create_link | ...
  domain_id uuid references public.domains(id) on delete set null,
  link_id uuid references public.links(id) on delete set null,
  file_id uuid references public.files(id) on delete set null,
  domain_hostname text,                   -- denormalised so history survives deletes
  link_path text,
  filename text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Per-user counters (super admin can edit / reset) ----------
-- total = base + number of matching activity_log rows since counted_from
create table if not exists public.user_counters (
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null,
  base integer not null default 0,
  counted_from timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, action)
);

-- ---------- Indexes ----------
create index if not exists files_link_idx on public.files(link_id);
create index if not exists files_uploaded_at_idx on public.files(uploaded_at desc);
create index if not exists files_updated_at_idx on public.files(updated_at desc);
create index if not exists files_uploaded_by_idx on public.files(uploaded_by);
create index if not exists links_domain_idx on public.links(domain_id);
create index if not exists activity_user_action_idx on public.activity_log(user_id, action, created_at);
create index if not exists activity_created_idx on public.activity_log(created_at desc);

-- ---------- Views ----------
create or replace view public.links_view as
select
  l.*,
  coalesce(f.file_count, 0)::int    as file_count,
  coalesce(f.total_size, 0)::bigint as total_size,
  f.last_upload_at
from public.links l
left join (
  select link_id, count(*) as file_count, sum(size) as total_size, max(uploaded_at) as last_upload_at
  from public.files
  group by link_id
) f on f.link_id = l.id;

-- ---------- Functions ----------
create or replace function public.increment_download(file_uuid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.files
     set download_count = download_count + 1,
         last_downloaded_at = now()
   where id = file_uuid;
$$;

-- Counts per user per action (upload/replace/rename/delete) honoring edits/resets.
create or replace function public.user_action_counts(p_user_id uuid default null)
returns table (
  user_id uuid,
  action text,
  base integer,
  counted_from timestamptz,
  activity_count bigint,
  total bigint
)
language sql
stable
set search_path = public
as $$
  with a as (
    select unnest(array['upload', 'replace', 'rename', 'delete']) as action
  ),
  u as (
    select id from public.users where p_user_id is null or id = p_user_id
  ),
  c as (
    select u.id as user_id,
           a.action,
           coalesce(uc.base, 0) as base,
           coalesce(uc.counted_from, '1970-01-01'::timestamptz) as counted_from
    from u
    cross join a
    left join public.user_counters uc on uc.user_id = u.id and uc.action = a.action
  ),
  n as (
    select c.user_id, c.action, c.base, c.counted_from,
           (select count(*) from public.activity_log l
             where l.user_id = c.user_id
               and l.action = c.action
               and l.created_at >= c.counted_from) as activity_count
    from c
  )
  select n.user_id, n.action, n.base, n.counted_from, n.activity_count,
         (n.base + n.activity_count)::bigint as total
  from n;
$$;

-- Breakdown of a user's counted actions by domain and link (since the last reset).
create or replace function public.user_action_breakdown(p_user_id uuid)
returns table (
  action text,
  domain_id uuid,
  domain_hostname text,
  link_id uuid,
  link_path text,
  cnt bigint
)
language sql
stable
set search_path = public
as $$
  select l.action, l.domain_id, l.domain_hostname, l.link_id, l.link_path, count(*) as cnt
  from public.activity_log l
  left join public.user_counters uc on uc.user_id = l.user_id and uc.action = l.action
  where l.user_id = p_user_id
    and l.action in ('upload', 'replace', 'rename', 'delete')
    and l.created_at >= coalesce(uc.counted_from, '1970-01-01'::timestamptz)
  group by l.action, l.domain_id, l.domain_hostname, l.link_id, l.link_path
  order by l.domain_hostname, l.link_path, l.action;
$$;

create or replace function public.dashboard_stats()
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'domains',        (select count(*) from public.domains),
    'active_domains', (select count(*) from public.domains where is_active),
    'links',          (select count(*) from public.links),
    'files',          (select count(*) from public.files),
    'total_size',     (select coalesce(sum(size), 0) from public.files),
    'downloads',      (select coalesce(sum(download_count), 0) from public.files),
    'users',          (select count(*) from public.users),
    'uploads_today',  (select count(*) from public.files where uploaded_at >= date_trunc('day', now())),
    'uploads_7d',     (select count(*) from public.files where uploaded_at >= now() - interval '7 days')
  );
$$;

-- ---------- Lock down ----------
-- Only the server (service_role key) talks to the database. Block anon/authenticated keys.
alter table public.users         enable row level security;
alter table public.domains       enable row level security;
alter table public.links         enable row level security;
alter table public.files         enable row level security;
alter table public.activity_log  enable row level security;
alter table public.user_counters enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- ============================================================
--  Appostta — verifiable documents with a per-domain QR link
--  Appended to the same file: re-running the whole script is still safe.
-- ============================================================

-- ---------- One row of panel-wide defaults ----------
-- Single row, pinned to a fixed id so the app can upsert without first looking it up.
create table if not exists public.appostta_settings (
  id boolean primary key default true check (id),
  org_name text not null default '',
  org_tagline text not null default '',
  number_prefix text not null default 'APT',
  -- Seeds the editable field list of every newly created record: [{ "label": "...", "value": "..." }]
  default_fields jsonb not null default '[]'::jsonb,
  signatory_name text not null default '',
  signature_r2_key text,
  signature_content_type text,
  footer_note text not null default '',
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.appostta_settings (id) values (true) on conflict (id) do nothing;

-- ---------- Records ----------
create table if not exists public.appostta_records (
  id uuid primary key default gen_random_uuid(),
  -- The domain the verification link is built on. Its documents are removed with it.
  domain_id uuid not null references public.domains(id) on delete cascade,
  number text not null unique,            -- e.g. APT-MUBN-NGDW-EGCW
  issued_on date not null,                -- drives day/month/year in the link

  -- The uploaded document, stored in R2 under the appostta/ prefix.
  doc_filename text,
  doc_r2_key text unique,
  doc_size bigint not null default 0,
  doc_content_type text,
  doc_uploaded_at timestamptz,
  doc_replaced_at timestamptz,

  -- Per-record certificate rows: [{ "label": "...", "value": "..." }]
  fields jsonb not null default '[]'::jsonb,

  -- Blank means "use the value from appostta_settings".
  signatory_name text not null default '',
  signature_r2_key text,
  signature_content_type text,

  notes text not null default '',
  download_count bigint not null default 0,
  last_downloaded_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The number is matched case-insensitively when a visitor verifies, so it must be unique that way too.
create unique index if not exists appostta_number_upper_idx on public.appostta_records (upper(number));
-- A visitor arrives with number + date; this is the lookup that serves them.
create index if not exists appostta_lookup_idx on public.appostta_records (upper(number), issued_on);
create index if not exists appostta_domain_idx on public.appostta_records (domain_id);
create index if not exists appostta_created_idx on public.appostta_records (created_at desc);

create or replace view public.appostta_view as
select r.*, d.hostname as domain_hostname, d.is_active as domain_is_active
from public.appostta_records r
join public.domains d on d.id = r.domain_id;

create or replace function public.increment_appostta_download(record_uuid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.appostta_records
     set download_count = download_count + 1,
         last_downloaded_at = now()
   where id = record_uuid;
$$;

-- ---------- Lock down ----------
alter table public.appostta_settings enable row level security;
alter table public.appostta_records  enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
