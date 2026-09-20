-- ============================================================
--  Appostta — verifiable documents with a per-domain QR link
--
--  This is the Appostta part of schema.sql on its own, so it can be run
--  without re-sending the whole file. Safe to re-run.
--
--  Supabase -> SQL Editor -> New query -> paste -> Run
--  Requires public.users and public.domains to exist already (schema.sql).
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
-- Only the server (service_role key) talks to the database. Block anon/authenticated keys.
alter table public.appostta_settings enable row level security;
alter table public.appostta_records  enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
