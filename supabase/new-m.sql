-- ============================================================
--  New M — attestation documents with a verification link
--
--  This is the New M part of schema.sql on its own, so it can be run
--  without re-sending the whole file. Safe to re-run.
--
--  Supabase -> SQL Editor -> New query -> paste -> Run
--  Requires public.users to exist already (schema.sql).
-- ============================================================

-- The first version of New M was a folder-style file manager. It never held any data and the
-- panel no longer reads it, so its tables go.
drop view if exists public.new_m_links_view;
drop table if exists public.new_m_files;
drop table if exists public.new_m_links;

-- ---------- Domains ----------
-- New M keeps its own list of domains and subdomains, apart from the Domains page.
create table if not exists public.new_m_domains (
  id uuid primary key default gen_random_uuid(),
  hostname text not null unique,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Links ----------
-- Each domain offers one or more links. A link is everything after the domain, written freely, with
-- {attestation_number} and {issue_date} wherever a document's own values belong, e.g.
-- /verify-general-attestation-by-qr?attestation_number={attestation_number}&issue_date={issue_date}
create table if not exists public.new_m_link_templates (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.new_m_domains(id) on delete cascade,
  name text not null default '',
  template text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain_id, template)
);

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

-- ---------- Sticker settings ----------
-- One row. The sticker's background image as the super admin set it, stored in R2 under
-- new-m/backgrounds/. Empty means none has been uploaded yet, and no sticker can be made until one is.
create table if not exists public.new_m_settings (
  id boolean primary key default true check (id),
  background_r2_key text,
  background_content_type text,
  background_filename text,
  -- The app draws the labels and the QR border itself; the title bar and table lines come with the image.
  -- True only for a background that already has the labels and QR border printed on it, so they are not
  -- drawn twice.
  background_has_frame boolean not null default false,
  -- Where the super admin placed the image on the 958 x 761 sticker and what is cropped off it:
  -- {x, y, width, height, crop?: {top, right, bottom, left}} (crop as shares of the image). Anything past
  -- the sticker is cut off too. Null stretches it over the whole sticker.
  background_placement jsonb,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.new_m_settings (id) values (true) on conflict (id) do nothing;

-- Added after the first release, for databases that already have the table.
alter table public.new_m_settings add column if not exists background_has_frame boolean not null default false;
alter table public.new_m_settings add column if not exists background_placement jsonb;

-- ---------- Documents ----------
create table if not exists public.new_m_records (
  id uuid primary key default gen_random_uuid(),
  -- The New M domain the link is built on. Its documents are removed with it.
  domain_id uuid not null references public.new_m_domains(id) on delete cascade,
  -- The domain link the document uses. The link follows it, so editing it in settings changes the
  -- document's link and QR code. link_template keeps a copy, for when the link is removed.
  link_id uuid references public.new_m_link_templates(id) on delete set null,
  link_template text not null default '',
  -- Unique across every domain. Always GEN, then three groups of four capital letters.
  attestation_number text not null unique check (attestation_number ~ '^GEN-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}$'),
  issue_date date not null,               -- filled into the link as DDMMYYYY

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

  -- The QR code of the complete link, saved with the document as an SVG. qr_url is the link it was
  -- drawn from; when the link changes, a new code replaces this one.
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
alter table public.new_m_records add column if not exists link_id uuid references public.new_m_link_templates(id) on delete set null;
alter table public.new_m_records add column if not exists link_template text not null default '';

-- Documents uploaded while New M still used the Domains page move to New M's own domains:
-- each hostname they used becomes a New M domain with the link they were built on, so their
-- links and QR codes stay exactly as they were. Runs once; afterwards there is nothing to move.
do $$
declare
  standard constant text :=
    '/verify-general-attestation-by-qr?attestation_number={attestation_number}&issue_date={issue_date}';
begin
  if exists (
    select 1
      from pg_constraint
     where conrelid = 'public.new_m_records'::regclass
       and contype = 'f'
       and confrelid = 'public.domains'::regclass
  ) then
    drop view if exists public.new_m_view;

    insert into public.new_m_domains (hostname)
    select distinct d.hostname
      from public.new_m_records r
      join public.domains d on d.id = r.domain_id
    on conflict (hostname) do nothing;

    insert into public.new_m_link_templates (domain_id, name, template)
    select nd.id, 'Standard', standard
      from public.new_m_domains nd
     where nd.hostname in (
             select d.hostname from public.new_m_records r join public.domains d on d.id = r.domain_id
           )
    on conflict (domain_id, template) do nothing;

    alter table public.new_m_records add column m_domain_id uuid;
    update public.new_m_records r
       set m_domain_id = nd.id,
           link_id = t.id,
           link_template = standard
      from public.domains d
      join public.new_m_domains nd on nd.hostname = d.hostname
      join public.new_m_link_templates t on t.domain_id = nd.id and t.template = standard
     where d.id = r.domain_id;

    alter table public.new_m_records drop column domain_id;
    alter table public.new_m_records rename column m_domain_id to domain_id;
    alter table public.new_m_records alter column domain_id set not null;
    alter table public.new_m_records
      add constraint new_m_records_domain_id_fkey
      foreign key (domain_id) references public.new_m_domains(id) on delete cascade;
  end if;
end $$;

create index if not exists new_m_link_templates_domain_idx on public.new_m_link_templates (domain_id);
create index if not exists new_m_records_domain_idx on public.new_m_records (domain_id);
create index if not exists new_m_records_link_idx on public.new_m_records (link_id);
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
       l.name      as link_name,
       l.template  as link_current_template,
       u.name      as uploader_name,
       u.email     as uploader_email
from public.new_m_records r
join public.new_m_domains d on d.id = r.domain_id
left join public.new_m_link_templates l on l.id = r.link_id
left join public.users u on u.id = r.created_by;

-- Settings show how many documents each domain and each link carries, since editing either changes
-- those documents' links and QR codes.
drop view if exists public.new_m_domains_view;
create view public.new_m_domains_view as
select d.*,
       (select count(*) from public.new_m_records r where r.domain_id = d.id)::int as document_count
from public.new_m_domains d;

drop view if exists public.new_m_link_templates_view;
create view public.new_m_link_templates_view as
select t.*,
       (select count(*) from public.new_m_records r where r.link_id = t.id)::int as document_count
from public.new_m_link_templates t;

-- ---------- Saving many QR codes at once ----------
-- A renamed domain or an edited link gives many documents new links. Their new QR codes arrive as one
-- list and are saved in a single statement, instead of one request per document.
-- items: [{ "id": "...", "qr_url": "...", "qr_svg": "...", "link_template": "..." }]
create or replace function public.new_m_set_qr(items jsonb)
returns integer
language sql
set search_path = public
as $$
  with changed as (
    update public.new_m_records r
       set qr_url = i.qr_url,
           qr_svg = i.qr_svg,
           link_template = i.link_template,
           qr_updated_at = now()
      from jsonb_to_recordset(items) as i(id uuid, qr_url text, qr_svg text, link_template text)
     where r.id = i.id
    returning 1
  )
  select count(*)::int from changed;
$$;

-- A new function can be called by everyone (PUBLIC) until that is taken away, and revoking from anon
-- alone does not do it. Only the server's service_role may call this one.
revoke all on function public.new_m_set_qr(jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.new_m_set_qr(jsonb) to service_role;
  end if;
end $$;

-- ---------- Lock down ----------
-- Only the server (service_role key) talks to the database. Block anon/authenticated keys.
alter table public.new_m_domains        enable row level security;
alter table public.new_m_link_templates enable row level security;
alter table public.new_m_options        enable row level security;
alter table public.new_m_officers       enable row level security;
alter table public.new_m_records        enable row level security;
alter table public.new_m_settings       enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
