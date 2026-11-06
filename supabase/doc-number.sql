-- ============================================================
--  7-digit document numbers for New M and Appo documents
--
--  Every document gets a random 7-digit number (e.g. 4827153),
--  unique within its system. Documents already saved are given
--  one here; a new document draws its own when it is saved,
--  unless the admin typed one. It is shown in the list, can be
--  searched, and can be placed on the sticker.
--
--  Run after new-m.sql and appo.sql. Safe to re-run.
--  Supabase -> SQL Editor -> New query -> paste -> Run
-- ============================================================

-- ---------- New M ----------
-- 7 digits, never starting with 0, e.g. 4827153.
create or replace function public.new_m_doc_number()
returns text
language sql
volatile
set search_path = public
as $$
  select public.new_m_random_text(1, '123456789') || public.new_m_random_text(6, '0123456789')
$$;

revoke all on function public.new_m_doc_number() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.new_m_doc_number() to service_role;
  end if;
end $$;

-- Every document already saved draws its own number here.
alter table public.new_m_records add column if not exists doc_number text not null default public.new_m_doc_number();

-- Two documents drawing the same number is unlikely but possible; the later one draws again, so the
-- unique index below can always be made.
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

-- The list reads documents through this view (select r.*), so it is made again to show the new column.
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

-- ---------- Appo ----------
create or replace function public.appo_doc_number()
returns text
language sql
volatile
set search_path = public
as $$
  select public.appo_random_text(1, '123456789') || public.appo_random_text(6, '0123456789')
$$;

revoke all on function public.appo_doc_number() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.appo_doc_number() to service_role;
  end if;
end $$;

alter table public.appo_records add column if not exists doc_number text not null default public.appo_doc_number();

do $$
begin
  loop
    update public.appo_records r
       set doc_number = public.appo_doc_number()
     where exists (select 1 from public.appo_records o where o.doc_number = r.doc_number and o.id < r.id);
    exit when not found;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'appo_records_doc_number_check') then
    alter table public.appo_records
      add constraint appo_records_doc_number_check check (doc_number ~ '^[0-9]{7}$');
  end if;
end $$;

create unique index if not exists appo_records_doc_number_idx on public.appo_records (doc_number);

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

-- The views are read by the server only.
revoke all on public.new_m_view from anon, authenticated;
revoke all on public.appo_view from anon, authenticated;
