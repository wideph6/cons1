-- ============================================================
--  Finance accounts, count changes, kept replaced files and
--  approvals for edits to month-old New M / Appo documents
--
--  Run after schema.sql, new-m.sql and appo.sql. Safe to re-run.
--  Supabase -> SQL Editor -> New query -> paste -> Run
-- ============================================================

-- ---------- Counts: New M and Appo documents are counted too ----------
-- Each user's counts are their activity since the counter was last set or reset, plus the number it was set
-- to (user_counters). Besides Old M's uploads, replaces, renames and deletes, every New M and Appo document a
-- user uploads now counts (create_new_m, create_appo). schema.sql defines the same functions.
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

-- ---------- Finance ----------
-- What each new entry costs, as the super admin set it: an Old M file upload, a New M document, an Appo
-- document. A change applies to entries made from then on; entries already made keep their amount.
create table if not exists public.finance_settings (
  id boolean primary key default true check (id),
  rate_old_m numeric(12, 2) not null default 0 check (rate_old_m >= 0),
  rate_new_m numeric(12, 2) not null default 0 check (rate_new_m >= 0),
  rate_appo  numeric(12, 2) not null default 0 check (rate_appo >= 0),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.finance_settings (id) values (true) on conflict (id) do nothing;

-- Whether a user may see their own account and send a payment request. Off until the super admin allows it;
-- while it is off, the super admin records the payments they receive.
create table if not exists public.finance_accounts (
  user_id uuid primary key references public.users(id) on delete cascade,
  visible boolean not null default false,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Every change to what a user owes, newest last. amount adds to it (a new entry) or takes off it (a lower
-- count, a payment). What a user owes is the sum of their amounts; what they paid is the payments.
--   charge        one new entry (activity_id is the counted action it is for; one charge per action)
--   count_change  the super admin set, lowered or reset a count: quantity entries at the rate then in force
--   payment       money received: an accepted request (request_id) or recorded by the super admin
create table if not exists public.finance_entries (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('charge', 'count_change', 'payment')),
  system text check (system in ('old_m', 'new_m', 'appo')),
  quantity integer not null default 0,
  rate numeric(12, 2) not null default 0,
  amount numeric(14, 2) not null,
  note text not null default '',
  activity_id bigint,
  request_id uuid,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists finance_entries_activity_idx on public.finance_entries (activity_id) where activity_id is not null;
create index if not exists finance_entries_user_idx on public.finance_entries (user_id, created_at desc);

-- A user telling the super admin they paid. It changes nothing until it is accepted.
create table if not exists public.finance_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists finance_requests_status_idx on public.finance_requests (status, created_at desc);
create index if not exists finance_requests_user_idx on public.finance_requests (user_id, created_at desc);

-- What each user owes now and has paid so far.
create or replace view public.finance_balances as
select u.id as user_id,
       coalesce(sum(e.amount), 0)::numeric(14, 2) as pending,
       coalesce(-sum(e.amount) filter (where e.kind = 'payment'), 0)::numeric(14, 2) as paid,
       coalesce(sum(e.amount) filter (where e.kind = 'charge'), 0)::numeric(14, 2) as charged
from public.users u
left join public.finance_entries e on e.user_id = u.id
group by u.id;

-- Every new entry an admin makes is charged at the rate in force, as it is logged: an Old M upload, a New M
-- document, an Appo document. The super admin's own entries are not charged.
create or replace function public.finance_charge_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_system text;
  v_rate numeric(12, 2);
begin
  v_system := case new.action
    when 'upload' then 'old_m'
    when 'create_new_m' then 'new_m'
    when 'create_appo' then 'appo'
  end;
  if v_system is null or new.user_id is null then
    return new;
  end if;
  if not exists (select 1 from public.users where id = new.user_id and role = 'admin') then
    return new;
  end if;
  select case v_system when 'old_m' then rate_old_m when 'new_m' then rate_new_m else rate_appo end
    into v_rate
    from public.finance_settings
   where id;
  if coalesce(v_rate, 0) <= 0 then
    return new;
  end if;
  insert into public.finance_entries (user_id, kind, system, quantity, rate, amount, activity_id)
  values (new.user_id, 'charge', v_system, 1, v_rate, v_rate, new.id)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists finance_charge_activity on public.activity_log;
create trigger finance_charge_activity
  after insert on public.activity_log
  for each row execute function public.finance_charge_activity();

-- A count set, lowered or reset together with what it does to the user's account, in one step, so the two
-- never disagree. rows: [{action, base}]; entries: [{system, quantity, rate, amount, note}].
create or replace function public.finance_set_counts(p_user uuid, p_by uuid, p_rows jsonb, p_entries jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.user_counters (user_id, action, base, counted_from, updated_by, updated_at)
  select p_user, r.action, r.base, now(), p_by, now()
    from jsonb_to_recordset(p_rows) as r(action text, base integer)
  on conflict (user_id, action) do update
    set base = excluded.base,
        counted_from = excluded.counted_from,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  insert into public.finance_entries (user_id, kind, system, quantity, rate, amount, note, created_by)
  select p_user, 'count_change', e.system, e.quantity, e.rate, e.amount, coalesce(e.note, ''), p_by
    from jsonb_to_recordset(p_entries) as e(system text, quantity integer, rate numeric, amount numeric, note text);
end $$;

-- Accepting a payment request takes its amount off what the user owes, once, even if two clicks race.
create or replace function public.finance_decide_request(p_id uuid, p_by uuid, p_accept boolean, p_note text)
returns text
language plpgsql
set search_path = public
as $$
declare
  r public.finance_requests%rowtype;
begin
  update public.finance_requests
     set status = case when p_accept then 'accepted' else 'rejected' end,
         decided_by = p_by,
         decided_at = now(),
         decision_note = coalesce(p_note, '')
   where id = p_id and status = 'pending'
  returning * into r;
  if not found then
    return 'not_pending';
  end if;
  if p_accept then
    insert into public.finance_entries (user_id, kind, amount, note, request_id, created_by)
    values (r.user_id, 'payment', -r.amount, r.note, r.id, p_by);
  end if;
  return r.status;
end $$;

-- ---------- Replaced files are kept for 15 days ----------
-- When a file or a document's PDF is replaced, visitors only ever get the new one, but the old one stays in
-- R2 for 15 days, so the super admin can compare the two. After that the app deletes it (deleted_at).
create table if not exists public.replaced_files (
  id uuid primary key default gen_random_uuid(),
  system text not null check (system in ('old_m', 'new_m', 'appo')),
  -- files.id, new_m_records.id or appo_records.id; no foreign key, so the history outlives a deleted record.
  record_id uuid not null,
  -- What the admin panel calls the record: the file's name or the attestation number.
  label text not null default '',
  old_key text not null unique,
  old_filename text not null default '',
  old_size bigint not null default 0,
  old_content_type text not null default 'application/pdf',
  new_key text,
  new_filename text not null default '',
  replaced_by uuid references public.users(id) on delete set null,
  replaced_at timestamptz not null default now(),
  delete_after timestamptz not null default now() + interval '15 days',
  deleted_at timestamptz
);
create index if not exists replaced_files_record_idx on public.replaced_files (system, record_id, replaced_at desc);
create index if not exists replaced_files_due_idx on public.replaced_files (delete_after) where deleted_at is null;

-- ---------- Edits to month-old documents wait for approval ----------
-- An admin's edit (or replaced PDF) of a New M or Appo document uploaded more than a month ago does not go
-- live until the super admin approves it; until then visitors see the document as it was. One waiting
-- change per document. request holds the edit as it was sent; summary the before and after of each field,
-- for the review. A PDF sent with it (new_doc_key) is only attached once the change is approved.
create table if not exists public.new_m_pending_edits (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references public.new_m_records(id) on delete cascade,
  request jsonb not null,
  summary jsonb not null default '[]'::jsonb,
  new_doc_key text,
  requested_by uuid references public.users(id) on delete set null,
  requested_at timestamptz not null default now()
);

create table if not exists public.appo_pending_edits (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references public.appo_records(id) on delete cascade,
  request jsonb not null,
  summary jsonb not null default '[]'::jsonb,
  new_doc_key text,
  requested_by uuid references public.users(id) on delete set null,
  requested_at timestamptz not null default now()
);

-- ---------- Lock down ----------
alter table public.finance_settings    enable row level security;
alter table public.finance_accounts    enable row level security;
alter table public.finance_entries     enable row level security;
alter table public.finance_requests    enable row level security;
alter table public.replaced_files      enable row level security;
alter table public.new_m_pending_edits enable row level security;
alter table public.appo_pending_edits  enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

revoke all on function public.user_action_counts(uuid) from public;
revoke all on function public.user_action_breakdown(uuid) from public;
revoke all on function public.finance_charge_activity() from public;
revoke all on function public.finance_set_counts(uuid, uuid, jsonb, jsonb) from public;
revoke all on function public.finance_decide_request(uuid, uuid, boolean, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.user_action_counts(uuid),
                              public.user_action_breakdown(uuid),
                              public.finance_set_counts(uuid, uuid, jsonb, jsonb),
                              public.finance_decide_request(uuid, uuid, boolean, text)
       to service_role;
  end if;
end $$;
