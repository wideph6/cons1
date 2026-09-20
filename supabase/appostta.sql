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

  -- The certificate rows, defined once here. Every record created afterwards copies these rows as
  -- they read at that moment, so editing this list never rewrites a record that already exists.
  -- [{ "id": "...", "label": "...", "options": ["..."], "allow_custom": true, "default_value": "" }]
  field_defs jsonb not null default '[]'::jsonb,

  -- Every signature a record can be issued under, so the record form is a pick and not an upload.
  -- [{ "id": "...", "name": "...", "r2_key": "appostta/signatures/...", "content_type": "image/png" }]
  signatures jsonb not null default '[]'::jsonb,
  -- Preselected in the record form. Blank falls back to the first signature.
  default_signature_id text not null default '',

  footer_note text not null default '',

  -- Superseded by field_defs and signatures. Kept so the carry-forward below runs as plain SQL on a
  -- database of either age, and so a panel set up before this change is never read as empty.
  default_fields jsonb not null default '[]'::jsonb,
  signatory_name text not null default '',
  signature_r2_key text,
  signature_content_type text,

  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.appostta_settings (id) values (true) on conflict (id) do nothing;

-- Added after the first release, for databases created before the settings-driven rows.
alter table public.appostta_settings add column if not exists field_defs jsonb not null default '[]'::jsonb;
alter table public.appostta_settings add column if not exists signatures jsonb not null default '[]'::jsonb;
alter table public.appostta_settings add column if not exists default_signature_id text not null default '';
alter table public.appostta_settings add column if not exists default_fields jsonb not null default '[]'::jsonb;
alter table public.appostta_settings add column if not exists signatory_name text not null default '';
alter table public.appostta_settings add column if not exists signature_r2_key text;
alter table public.appostta_settings add column if not exists signature_content_type text;

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

  -- The certificate rows as they read when this record was created, frozen here.
  -- [{ "id": "...", "label": "...", "value": "..." }]
  fields jsonb not null default '[]'::jsonb,

  -- Which settings signature was picked, plus a copy of it. The copy is what the certificate prints,
  -- so editing or removing that signature later leaves records already issued alone.
  signature_id text not null default '',
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

alter table public.appostta_records add column if not exists signature_id text not null default '';

-- A signature image now belongs to settings and is shared by every record issued under it, so the
-- key has to be free to repeat. Older databases put a unique constraint on it; drop it if present.
do $$
declare c text;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.appostta_records'::regclass
       and contype = 'u'
       and pg_get_constraintdef(oid) = 'UNIQUE (signature_r2_key)'
  loop
    execute format('alter table public.appostta_records drop constraint %I', c);
  end loop;
end $$;

-- The number is matched case-insensitively when a visitor verifies, so it must be unique that way too.
create unique index if not exists appostta_number_upper_idx on public.appostta_records (upper(number));
-- A visitor arrives with number + date; this is the lookup that serves them.
create index if not exists appostta_lookup_idx on public.appostta_records (upper(number), issued_on);
create index if not exists appostta_domain_idx on public.appostta_records (domain_id);
create index if not exists appostta_created_idx on public.appostta_records (created_at desc);
-- Asked before a signature is removed from settings: is any record still printing it?
create index if not exists appostta_signature_idx on public.appostta_records (signature_r2_key);

-- ---------- Carry the old single-signature setup forward ----------
-- Before this change the panel held one shared signature and one list of blank default rows. Each
-- becomes the first entry of its new list, once, so nothing configured earlier is lost.
update public.appostta_settings
   set field_defs = coalesce((
         select jsonb_agg(
                  jsonb_build_object(
                    'id', 'f' || ord::text,
                    'label', coalesce(e ->> 'label', ''),
                    'options', '[]'::jsonb,
                    'allow_custom', true,
                    'default_value', coalesce(e ->> 'value', '')
                  )
                  order by ord
                )
           from jsonb_array_elements(default_fields) with ordinality as t(e, ord)
          where coalesce(e ->> 'label', '') <> ''
       ), '[]'::jsonb)
 where id = true
   and jsonb_array_length(field_defs) = 0
   and jsonb_typeof(default_fields) = 'array'
   and jsonb_array_length(default_fields) > 0;

update public.appostta_settings
   set signatures = jsonb_build_array(
         jsonb_build_object(
           'id', 's1',
           'name', coalesce(nullif(signatory_name, ''), 'Authorised signatory'),
           'r2_key', signature_r2_key,
           'content_type', coalesce(signature_content_type, 'image/png')
         )
       ),
       default_signature_id = 's1'
 where id = true
   and jsonb_array_length(signatures) = 0
   and coalesce(signature_r2_key, '') <> '';

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
