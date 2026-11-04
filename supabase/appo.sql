-- ============================================================
--  Appo — attestation documents with a verification link
--  (and each PDF's own /storage/applications/… address)
--
--  An independent copy of New M with its own tables (appo_*),
--  functions and views; it never reads or changes New M's.
--  Safe to re-run.
--
--  Supabase -> SQL Editor -> New query -> paste -> Run
--  Requires public.users to exist already (schema.sql).
-- ============================================================

-- ---------- Domains ----------
-- Appo keeps its own list of domains and subdomains, apart from the Domains page.
create table if not exists public.appo_domains (
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
create table if not exists public.appo_link_templates (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.appo_domains(id) on delete cascade,
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
create table if not exists public.appo_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('document_type', 'issuing_office', 'issuing_authority')),
  value text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- "Degree" and "degree" are the same choice.
create unique index if not exists appo_options_value_idx on public.appo_options (kind, lower(value));

-- ---------- Approving officers ----------
-- Name, designation and signature are saved together, so picking one officer fills in all three.
create table if not exists public.appo_officers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  designation text not null default '',
  signature_r2_key text,                  -- appo/signatures/...
  signature_content_type text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Sticker settings ----------
-- One row. The sticker's background image as the super admin set it, stored in R2 under
-- appo/backgrounds/. Empty means none has been uploaded yet, and no sticker can be made until one is.
create table if not exists public.appo_settings (
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

insert into public.appo_settings (id) values (true) on conflict (id) do nothing;

-- ---------- Verification page ----------
-- What the public verification page says and links to, as the super admin set it under Appo → Page design.
-- One row per view: 'desktop' now, 'mobile' when its own design is made. content is JSON; anything it
-- leaves out shows the design's default. Uploaded logos are kept in R2 under appo/page/ and only their
-- storage keys are stored here.
create table if not exists public.appo_page_settings (
  view text primary key check (view in ('desktop', 'mobile')),
  content jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------- Document addresses ----------
-- Each document's PDF opens at /storage/applications/{doc_storage_number}/documents/{doc_hash_name}.pdf
-- on its own domain: a 13-digit number and a 40-character name of letters and digits, both random and
-- unique. The name is also what the PDF is called on the page, when it is downloaded and in R2: a PDF
-- uploaded through the panel is stored under a fresh name, which the document takes (a replaced PDF
-- brings a new one); documents saved before that draw one here. Being impossible to guess is what keeps
-- the address private.

-- Random characters from alphabet, from the server's secure random source (gen_random_uuid). Bytes 6
-- and 8 of a uuid hold its version and variant, so only the other 14 are used; bytes at the top of
-- the range are skipped rather than folded with %, which would favour the first characters.
create or replace function public.appo_random_text(len integer, alphabet text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  result text := '';
  n constant integer := length(alphabet);
  usable constant integer := 256 - 256 % length(alphabet);
  bytes bytea;
  b integer;
begin
  while length(result) < len loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    for i in 0..15 loop
      continue when i in (6, 8);
      b := get_byte(bytes, i);
      continue when b >= usable;
      result := result || substr(alphabet, b % n + 1, 1);
      exit when length(result) = len;
    end loop;
  end loop;
  return result;
end $$;

-- 13 digits, never starting with 0, e.g. 3660176069053.
create or replace function public.appo_storage_number()
returns text
language sql
volatile
set search_path = public
as $$
  select public.appo_random_text(1, '123456789') || public.appo_random_text(12, '0123456789')
$$;

-- 40 letters and digits, e.g. ddwhrO4nWtA99vRYDAnUVtWcK3aoYPJhxmbVlwLp.
create or replace function public.appo_hash_name()
returns text
language sql
volatile
set search_path = public
as $$
  select public.appo_random_text(40, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
$$;

-- Only the server's service_role, which saves documents, may call these.
revoke all on function public.appo_random_text(integer, text) from public;
revoke all on function public.appo_storage_number() from public;
revoke all on function public.appo_hash_name() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.appo_random_text(integer, text) to service_role;
    grant execute on function public.appo_storage_number() to service_role;
    grant execute on function public.appo_hash_name() to service_role;
  end if;
end $$;

-- ---------- Documents ----------
create table if not exists public.appo_records (
  id uuid primary key default gen_random_uuid(),
  -- The Appo domain the link is built on. Its documents are removed with it.
  domain_id uuid not null references public.appo_domains(id) on delete cascade,
  -- The domain link the document uses. The link follows it, so editing it in settings changes the
  -- document's link and QR code. link_template keeps a copy, for when the link is removed.
  link_id uuid references public.appo_link_templates(id) on delete set null,
  link_template text not null default '',
  -- Unique across every domain. Always GEN, then three groups of four capital letters.
  attestation_number text not null unique check (attestation_number ~ '^GEN-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}$'),
  issue_date date not null,               -- filled into the link as DDMMYYYY

  document_type text not null default '',
  issuing_office text not null default '',
  issuing_authority text not null default '',

  -- The officer picked from the saved list, plus a copy of what it said at that moment. The copy is
  -- what the document shows, so removing the officer from the list leaves this document as it is.
  officer_id uuid references public.appo_officers(id) on delete set null,
  officer_name text not null default '',
  officer_designation text not null default '',
  officer_signature_r2_key text,
  officer_signature_content_type text,

  -- The PDF, stored in R2 under appo/docs/.
  doc_filename text not null,
  doc_r2_key text not null unique,
  doc_size bigint not null default 0,
  doc_content_type text not null default 'application/pdf',
  doc_uploaded_at timestamptz not null default now(),
  doc_replaced_at timestamptz,
  -- The PDF's public address and name (see Document addresses above). The number stays for good; the name
  -- is the one the PDF is stored under in R2, so a replaced PDF brings a new one.
  doc_storage_number text not null default public.appo_storage_number(),
  doc_hash_name text not null default public.appo_hash_name(),

  -- The QR code of the complete link, saved with the document as an SVG. qr_url is the link it was
  -- drawn from; when the link changes, a new code replaces this one.
  qr_url text,
  qr_svg text,
  qr_updated_at timestamptz,

  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Two documents drawing the same number is next to impossible; should it ever happen, the later one
-- draws again, so the unique indexes below can always be made.
do $$
begin
  loop
    update public.appo_records r
       set doc_storage_number = public.appo_storage_number()
     where exists (select 1 from public.appo_records o where o.doc_storage_number = r.doc_storage_number and o.id < r.id);
    exit when not found;
  end loop;
  loop
    update public.appo_records r
       set doc_hash_name = public.appo_hash_name()
     where exists (select 1 from public.appo_records o where o.doc_hash_name = r.doc_hash_name and o.id < r.id);
    exit when not found;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'appo_records_doc_address_check') then
    alter table public.appo_records
      add constraint appo_records_doc_address_check
      check (doc_storage_number ~ '^[1-9][0-9]{12}$' and doc_hash_name ~ '^[A-Za-z0-9]{40}$');
  end if;
end $$;

create unique index if not exists appo_records_storage_number_idx on public.appo_records (doc_storage_number);
create unique index if not exists appo_records_hash_name_idx on public.appo_records (doc_hash_name);

create index if not exists appo_link_templates_domain_idx on public.appo_link_templates (domain_id);
create index if not exists appo_records_domain_idx on public.appo_records (domain_id);
create index if not exists appo_records_link_idx on public.appo_records (link_id);
create index if not exists appo_records_created_idx on public.appo_records (created_at desc);
-- A visitor arrives with number + date; this is the lookup that will serve them.
create index if not exists appo_records_lookup_idx on public.appo_records (attestation_number, issue_date);
-- Asked before a signature image is deleted: does any document still show it?
create index if not exists appo_records_signature_idx on public.appo_records (officer_signature_r2_key);

-- Dropped rather than replaced: the view is select r.*, so a column added to the table later shifts
-- the positions, and create-or-replace can only append to a view, never reorder.
drop view if exists public.appo_view;

create view public.appo_view as
select r.*,
       d.hostname  as domain_hostname,
       l.name      as link_name,
       l.template  as link_current_template,
       u.name      as uploader_name,
       u.email     as uploader_email
from public.appo_records r
join public.appo_domains d on d.id = r.domain_id
left join public.appo_link_templates l on l.id = r.link_id
left join public.users u on u.id = r.created_by;

-- Settings show how many documents each domain and each link carries, since editing either changes
-- those documents' links and QR codes.
drop view if exists public.appo_domains_view;
create view public.appo_domains_view as
select d.*,
       (select count(*) from public.appo_records r where r.domain_id = d.id)::int as document_count
from public.appo_domains d;

drop view if exists public.appo_link_templates_view;
create view public.appo_link_templates_view as
select t.*,
       (select count(*) from public.appo_records r where r.link_id = t.id)::int as document_count
from public.appo_link_templates t;

-- ---------- Saving many QR codes at once ----------
-- A renamed domain or an edited link gives many documents new links. Their new QR codes arrive as one
-- list and are saved in a single statement, instead of one request per document.
-- items: [{ "id": "...", "qr_url": "...", "qr_svg": "...", "link_template": "..." }]
create or replace function public.appo_set_qr(items jsonb)
returns integer
language sql
set search_path = public
as $$
  with changed as (
    update public.appo_records r
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
revoke all on function public.appo_set_qr(jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.appo_set_qr(jsonb) to service_role;
  end if;
end $$;

-- ---------- Lock down ----------
-- Only the server (service_role key) talks to the database. Block anon/authenticated keys.
alter table public.appo_domains        enable row level security;
alter table public.appo_link_templates enable row level security;
alter table public.appo_options        enable row level security;
alter table public.appo_officers       enable row level security;
alter table public.appo_records        enable row level security;
alter table public.appo_settings       enable row level security;
alter table public.appo_page_settings  enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
