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

-- Counts per user per action honoring edits/resets: Old M uploads, replaces, renames and deletes, and the
-- New M and Appo documents a user uploads (the same as in finance.sql).
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
    select unnest(array['upload', 'replace', 'rename', 'delete', 'create_new_m', 'create_appo']) as action
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
    and l.action in ('upload', 'replace', 'rename', 'delete', 'create_new_m', 'create_appo')
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

-- A function can be called by everyone (PUBLIC) until that is taken away, and revoking from anon and
-- authenticated alone leaves it open. Only the server's service_role may call these.
revoke all on function public.increment_download(uuid)      from public;
revoke all on function public.user_action_counts(uuid)      from public;
revoke all on function public.user_action_breakdown(uuid)   from public;
revoke all on function public.dashboard_stats()             from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.increment_download(uuid),
                              public.user_action_counts(uuid),
                              public.user_action_breakdown(uuid),
                              public.dashboard_stats()
       to service_role;
  end if;
end $$;

-- ============================================================
--  New M — attestation documents with a verification link
--  Appended to the same file: re-running the whole script is still safe.
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

-- ---------- Verification page ----------
-- What the public verification page says and links to, as the super admin set it under New M → Page design.
-- One row per view: 'desktop' now, 'mobile' when its own design is made. content is JSON; anything it
-- leaves out shows the design's default. Uploaded logos are kept in R2 under new-m/page/ and only their
-- storage keys are stored here.
create table if not exists public.new_m_page_settings (
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
create or replace function public.new_m_random_text(len integer, alphabet text)
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
create or replace function public.new_m_storage_number()
returns text
language sql
volatile
set search_path = public
as $$
  select public.new_m_random_text(1, '123456789') || public.new_m_random_text(12, '0123456789')
$$;

-- 40 letters and digits, e.g. ddwhrO4nWtA99vRYDAnUVtWcK3aoYPJhxmbVlwLp.
create or replace function public.new_m_hash_name()
returns text
language sql
volatile
set search_path = public
as $$
  select public.new_m_random_text(40, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
$$;

-- The document number: 7 digits, never starting with 0, e.g. 4827153.
create or replace function public.new_m_doc_number()
returns text
language sql
volatile
set search_path = public
as $$
  select public.new_m_random_text(1, '123456789') || public.new_m_random_text(6, '0123456789')
$$;

-- Only the server's service_role, which saves documents, may call these.
revoke all on function public.new_m_doc_number() from public;
revoke all on function public.new_m_random_text(integer, text) from public;
revoke all on function public.new_m_storage_number() from public;
revoke all on function public.new_m_hash_name() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.new_m_random_text(integer, text) to service_role;
    grant execute on function public.new_m_storage_number() to service_role;
    grant execute on function public.new_m_hash_name() to service_role;
    grant execute on function public.new_m_doc_number() to service_role;
  end if;
end $$;

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
  -- The PDF's public address and name (see Document addresses above). The number stays for good; the name
  -- is the one the PDF is stored under in R2, so a replaced PDF brings a new one.
  doc_storage_number text not null default public.new_m_storage_number(),
  doc_hash_name text not null default public.new_m_hash_name(),

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
-- Every document already saved draws its own number and name here.
alter table public.new_m_records add column if not exists doc_storage_number text not null default public.new_m_storage_number();
alter table public.new_m_records add column if not exists doc_hash_name text not null default public.new_m_hash_name();

-- Two documents drawing the same number is next to impossible; should it ever happen, the later one
-- draws again, so the unique indexes below can always be made.
do $$
begin
  loop
    update public.new_m_records r
       set doc_storage_number = public.new_m_storage_number()
     where exists (select 1 from public.new_m_records o where o.doc_storage_number = r.doc_storage_number and o.id < r.id);
    exit when not found;
  end loop;
  loop
    update public.new_m_records r
       set doc_hash_name = public.new_m_hash_name()
     where exists (select 1 from public.new_m_records o where o.doc_hash_name = r.doc_hash_name and o.id < r.id);
    exit when not found;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'new_m_records_doc_address_check') then
    alter table public.new_m_records
      add constraint new_m_records_doc_address_check
      check (doc_storage_number ~ '^[1-9][0-9]{12}$' and doc_hash_name ~ '^[A-Za-z0-9]{40}$');
  end if;
end $$;

create unique index if not exists new_m_records_storage_number_idx on public.new_m_records (doc_storage_number);
create unique index if not exists new_m_records_hash_name_idx on public.new_m_records (doc_hash_name);

-- The document number: 7 random digits, unique, shown in the list, searchable and placed on the sticker.
-- Every document already saved draws its own here; the admin may type another (see supabase/doc-number.sql).
alter table public.new_m_records add column if not exists doc_number text not null default public.new_m_doc_number();
do $$
begin
  loop
    update public.new_m_records r
       set doc_number = public.new_m_doc_number()
     where exists (select 1 from public.new_m_records o where o.doc_number = r.doc_number and o.id < r.id);
    exit when not found;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'new_m_records_doc_number_check') then
    alter table public.new_m_records
      add constraint new_m_records_doc_number_check check (doc_number ~ '^[0-9]{7}$');
  end if;
end $$;
create unique index if not exists new_m_records_doc_number_idx on public.new_m_records (doc_number);

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
alter table public.new_m_page_settings  enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
