-- ============================================================
--  New M — attestation documents with a verification link
--
--  This is the New M part of schema.sql on its own, so it can be run
--  without re-sending the whole file. Safe to re-run.
--
--  Supabase -> SQL Editor -> New query -> paste -> Run
--  Requires public.users and public.domains to exist already (schema.sql).
-- ============================================================

-- The first version of New M was a folder-style file manager. It never held any data and the
-- panel no longer reads it, so its tables go.
drop view if exists public.new_m_links_view;
drop table if exists public.new_m_files;
drop table if exists public.new_m_links;

-- ---------- Saved values ----------
-- Every document type, issuing office and issuing authority typed into an upload is kept here, so
-- the next upload can pick it from a list instead of typing it again.
create table if not exists public.new_m_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('document_type', 'issuing_office', 'issuing_authority')),
  value text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- "Degree" and "degree" are the same choice.
create unique index if not exists new_m_options_value_idx on public.new_m_options (kind, lower(value));

-- ---------- Approving officers ----------
-- Name, designation and signature are saved together, so picking one officer fills in all three.
create table if not exists public.new_m_officers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  designation text not null default '',
  signature_r2_key text,                  -- new-m/signatures/...
  signature_content_type text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Documents ----------
create table if not exists public.new_m_records (
  id uuid primary key default gen_random_uuid(),
  -- The domain the verification link is built on. Its documents are removed with it.
  domain_id uuid not null references public.domains(id) on delete cascade,
  -- Unique across every domain. Always GEN, then three groups of four capital letters.
  attestation_number text not null unique check (attestation_number ~ '^GEN-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}$'),
  issue_date date not null,               -- goes into the link as DDMMYYYY

  document_type text not null default '',
  issuing_office text not null default '',
  issuing_authority text not null default '',

  -- The officer picked from the saved list, plus a copy of what it said at that moment. The copy is
  -- what the document shows, so removing the officer from the list leaves this document as it is.
  officer_id uuid references public.new_m_officers(id) on delete set null,
  officer_name text not null default '',
  officer_designation text not null default '',
  officer_signature_r2_key text,
  officer_signature_content_type text,

  -- The PDF, stored in R2 under new-m/docs/.
  doc_filename text not null,
  doc_r2_key text not null unique,
  doc_size bigint not null default 0,
  doc_content_type text not null default 'application/pdf',
  doc_uploaded_at timestamptz not null default now(),
  doc_replaced_at timestamptz,

  -- The QR code of the verification link, saved with the document as an SVG. qr_url is the link it
  -- was drawn from; when an edit changes the link, a new code replaces this one.
  qr_url text,
  qr_svg text,
  qr_updated_at timestamptz,

  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added after the first release, for databases that already have the table.
alter table public.new_m_records add column if not exists qr_url text;
alter table public.new_m_records add column if not exists qr_svg text;
alter table public.new_m_records add column if not exists qr_updated_at timestamptz;

create index if not exists new_m_records_domain_idx on public.new_m_records (domain_id);
create index if not exists new_m_records_created_idx on public.new_m_records (created_at desc);
-- A visitor arrives with number + date; this is the lookup that will serve them.
create index if not exists new_m_records_lookup_idx on public.new_m_records (attestation_number, issue_date);
-- Asked before a signature image is deleted: does any document still show it?
create index if not exists new_m_records_signature_idx on public.new_m_records (officer_signature_r2_key);

-- Dropped rather than replaced: the view is select r.*, so a column added to the table later shifts
-- the positions, and create-or-replace can only append to a view, never reorder.
drop view if exists public.new_m_view;

create view public.new_m_view as
select r.*,
       d.hostname  as domain_hostname,
       d.is_active as domain_is_active,
       u.name      as uploader_name,
       u.email     as uploader_email
from public.new_m_records r
join public.domains d on d.id = r.domain_id
left join public.users u on u.id = r.created_by;

-- ---------- Lock down ----------
-- Only the server (service_role key) talks to the database. Block anon/authenticated keys.
alter table public.new_m_options  enable row level security;
alter table public.new_m_officers enable row level security;
alter table public.new_m_records  enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
