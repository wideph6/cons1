-- ============================================================
--  Commission-based users
--
--  A commission user may create cases (Old M files, New M and Appo
--  documents) and read and edit only their own. Their new cases and
--  their edits wait for the super admin's approval; until then visitors
--  see nothing new. Each approved new case earns them the commission
--  the super admin set for them for that system. What they are owed is
--  paid by the super admin: a payment they accept (or, when they cannot
--  see their Finance tab, one the super admin records) is taken off it.
--
--  Run after schema.sql, new-m.sql, appo.sql, doc-number.sql and
--  finance.sql. Safe to re-run.
--  Supabase -> SQL Editor -> New query -> paste -> Run
-- ============================================================

-- ---------- A third kind of user ----------
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('superadmin', 'admin', 'commission'));

-- ---------- Every case is approved, waiting or turned down ----------
-- A commission user's new case waits ('pending') until the super admin approves it; until then it is not
-- served to anyone. Turned down ('rejected', with the reason in review_note), it stays hidden until its user
-- changes it, which sends it again. Every case made before, and every case anyone else makes, is approved.
alter table public.files add column if not exists review_status text not null default 'approved';
alter table public.files add column if not exists review_note text not null default '';
alter table public.files add column if not exists reviewed_by uuid references public.users(id) on delete set null;
alter table public.files add column if not exists reviewed_at timestamptz;

alter table public.new_m_records add column if not exists review_status text not null default 'approved';
alter table public.new_m_records add column if not exists review_note text not null default '';
alter table public.new_m_records add column if not exists reviewed_by uuid references public.users(id) on delete set null;
alter table public.new_m_records add column if not exists reviewed_at timestamptz;

alter table public.appo_records add column if not exists review_status text not null default 'approved';
alter table public.appo_records add column if not exists review_note text not null default '';
alter table public.appo_records add column if not exists reviewed_by uuid references public.users(id) on delete set null;
alter table public.appo_records add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'files_review_status_check') then
    alter table public.files add constraint files_review_status_check check (review_status in ('approved', 'pending', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'new_m_records_review_status_check') then
    alter table public.new_m_records add constraint new_m_records_review_status_check check (review_status in ('approved', 'pending', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appo_records_review_status_check') then
    alter table public.appo_records add constraint appo_records_review_status_check check (review_status in ('approved', 'pending', 'rejected'));
  end if;
end $$;

-- The super admin's queue: only the few cases not yet approved.
create index if not exists files_review_idx on public.files (review_status, uploaded_at desc) where review_status <> 'approved';
create index if not exists new_m_records_review_idx on public.new_m_records (review_status, created_at desc) where review_status <> 'approved';
create index if not exists appo_records_review_idx on public.appo_records (review_status, created_at desc) where review_status <> 'approved';

-- The lists read documents through these views (select r.*), so they are made again to show the new columns.
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

-- ---------- Edits to approved Old M files wait for approval ----------
-- A commission user's replace, rename or move of one of their approved files is kept here until the super
-- admin approves it; visitors keep getting the file as it was. One waiting change per file, holding any of
-- the three: a new file (new_key, uploaded but not yet attached), a new name, another link.
create table if not exists public.old_m_pending_edits (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null unique references public.files(id) on delete cascade,
  new_filename text,
  new_link_id uuid references public.links(id) on delete cascade,
  new_key text,
  new_size bigint,
  new_content_type text,
  summary jsonb not null default '[]'::jsonb,
  requested_by uuid references public.users(id) on delete set null,
  requested_at timestamptz not null default now()
);

-- ---------- Commission ----------
-- What one approved new case earns each commission user, by system, as the super admin set it. A change
-- applies to cases approved from then on; commission already earned keeps its amount.
create table if not exists public.commission_rates (
  user_id uuid primary key references public.users(id) on delete cascade,
  rate_old_m numeric(12, 2) not null default 0 check (rate_old_m >= 0),
  rate_new_m numeric(12, 2) not null default 0 check (rate_new_m >= 0),
  rate_appo  numeric(12, 2) not null default 0 check (rate_appo >= 0),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Every change to what a commission user is owed, newest last. amount adds to it (commission) or takes off
-- it (a reversal, a payment); what they are owed is the sum.
--   commission  one approved new case (system, record_id), at the user's rate then; once per case
--   reversal    that case was deleted: its commission taken back; once per case
--   payment     money paid to the user: a payment request they accepted (request_id), or recorded by the
--               super admin while the user cannot see their Finance tab
create table if not exists public.commission_entries (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('commission', 'reversal', 'payment')),
  system text check (system in ('old_m', 'new_m', 'appo')),
  record_id uuid,
  label text not null default '',
  rate numeric(12, 2) not null default 0,
  amount numeric(14, 2) not null,
  note text not null default '',
  request_id uuid,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists commission_entries_once_idx
  on public.commission_entries (system, record_id, kind) where kind in ('commission', 'reversal');
create index if not exists commission_entries_user_idx on public.commission_entries (user_id, created_at desc);

-- A payment the super admin sends to a commission user who can see their Finance tab. It changes nothing
-- until the user accepts it; they may also turn it down, and the super admin may cancel it while it waits.
create table if not exists public.commission_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_note text not null default ''
);
create index if not exists commission_requests_user_idx on public.commission_requests (user_id, created_at desc);
create index if not exists commission_requests_status_idx on public.commission_requests (status, created_at desc);

-- What each user is owed now, and what they earned, lost to deleted cases and were paid so far.
create or replace view public.commission_balances as
select u.id as user_id,
       coalesce(sum(e.amount), 0)::numeric(14, 2) as remaining,
       coalesce(sum(e.amount) filter (where e.kind = 'commission'), 0)::numeric(14, 2) as earned,
       coalesce(-sum(e.amount) filter (where e.kind = 'reversal'), 0)::numeric(14, 2) as reversed,
       coalesce(-sum(e.amount) filter (where e.kind = 'payment'), 0)::numeric(14, 2) as paid
from public.users u
left join public.commission_entries e on e.user_id = u.id
group by u.id;

-- The super admin approves or turns down a waiting new case, in one step with its commission: approved, a
-- commission user's case earns their rate for its system then (nothing at 0), once. Returns the new status,
-- or 'not_pending' when the case is not waiting (already decided, or gone).
create or replace function public.commission_review(p_system text, p_record uuid, p_by uuid, p_approve boolean, p_note text)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_status text := case when p_approve then 'approved' else 'rejected' end;
  v_note text := case when p_approve then '' else coalesce(p_note, '') end;
  v_owner uuid;
  v_label text;
  v_rate numeric(12, 2);
begin
  if p_system = 'old_m' then
    update public.files
       set review_status = v_status, review_note = v_note, reviewed_by = p_by, reviewed_at = now()
     where id = p_record and review_status = 'pending'
    returning uploaded_by, filename into v_owner, v_label;
  elsif p_system = 'new_m' then
    update public.new_m_records
       set review_status = v_status, review_note = v_note, reviewed_by = p_by, reviewed_at = now()
     where id = p_record and review_status = 'pending'
    returning created_by, attestation_number into v_owner, v_label;
  elsif p_system = 'appo' then
    update public.appo_records
       set review_status = v_status, review_note = v_note, reviewed_by = p_by, reviewed_at = now()
     where id = p_record and review_status = 'pending'
    returning created_by, attestation_number into v_owner, v_label;
  else
    return 'bad_system';
  end if;
  if not found then
    return 'not_pending';
  end if;
  if p_approve and v_owner is not null and exists (select 1 from public.users where id = v_owner and role = 'commission') then
    select case p_system when 'old_m' then rate_old_m when 'new_m' then rate_new_m else rate_appo end
      into v_rate
      from public.commission_rates
     where user_id = v_owner;
    if coalesce(v_rate, 0) > 0 then
      insert into public.commission_entries (user_id, kind, system, record_id, label, rate, amount, created_by)
      values (v_owner, 'commission', p_system, p_record, coalesce(v_label, ''), v_rate, v_rate, p_by)
      on conflict do nothing;
    end if;
  end if;
  return v_status;
end $$;

-- A case deleted (by anyone, or with its link or domain) takes back the commission it earned, once.
create or replace function public.commission_reverse_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.commission_entries (user_id, kind, system, record_id, label, rate, amount, note)
  select e.user_id, 'reversal', e.system, e.record_id, e.label, e.rate, -e.amount, 'Case deleted'
    from public.commission_entries e
   where e.kind = 'commission' and e.system = tg_argv[0] and e.record_id = old.id
  on conflict do nothing;
  return old;
end $$;

drop trigger if exists commission_reverse_deleted on public.files;
create trigger commission_reverse_deleted
  after delete on public.files
  for each row execute function public.commission_reverse_deleted('old_m');

drop trigger if exists commission_reverse_deleted on public.new_m_records;
create trigger commission_reverse_deleted
  after delete on public.new_m_records
  for each row execute function public.commission_reverse_deleted('new_m');

drop trigger if exists commission_reverse_deleted on public.appo_records;
create trigger commission_reverse_deleted
  after delete on public.appo_records
  for each row execute function public.commission_reverse_deleted('appo');

-- The user accepts (taking the amount off what they are owed) or turns down a payment sent to them, once,
-- even if two clicks race. Only the user it was sent to can decide it.
create or replace function public.commission_decide_request(p_id uuid, p_user uuid, p_accept boolean, p_note text)
returns text
language plpgsql
set search_path = public
as $$
declare
  r public.commission_requests%rowtype;
begin
  update public.commission_requests
     set status = case when p_accept then 'accepted' else 'rejected' end,
         decided_at = now(),
         decision_note = coalesce(p_note, '')
   where id = p_id and user_id = p_user and status = 'pending'
  returning * into r;
  if not found then
    return 'not_pending';
  end if;
  if p_accept then
    insert into public.commission_entries (user_id, kind, amount, note, request_id, created_by)
    values (r.user_id, 'payment', -r.amount, r.note, r.id, r.created_by);
  end if;
  return r.status;
end $$;

-- ---------- Lock down ----------
alter table public.old_m_pending_edits enable row level security;
alter table public.commission_rates    enable row level security;
alter table public.commission_entries  enable row level security;
alter table public.commission_requests enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

revoke all on function public.commission_review(text, uuid, uuid, boolean, text) from public;
revoke all on function public.commission_reverse_deleted() from public;
revoke all on function public.commission_decide_request(uuid, uuid, boolean, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.commission_review(text, uuid, uuid, boolean, text),
                              public.commission_decide_request(uuid, uuid, boolean, text)
       to service_role;
  end if;
end $$;
