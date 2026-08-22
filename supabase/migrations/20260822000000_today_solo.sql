-- SkillHive main platform — solo daily driver persistence
--
-- NON-DESTRUCTIVE: adapts to the EXISTING shared schema (rooms/teams already
-- own focus_sessions, session_notes, and projects). This file never drops
-- tables, columns, or data. It:
--   1. creates today_projects (the /today tagging target — public.projects is
--      an unrelated showcase table and stays untouched)
--   2. adds optional solo-mode columns to focus_sessions / session_notes
--   3. widens session_notes.ritual_type to include 'capture'
--   4. adds owner-scoped RLS (additive — policies are OR'd, so existing
--      team/room policies keep working exactly as before)
--   5. creates security-definer aggregate RPCs for public pages

-- ---------------------------------------------------------------------------
-- today_projects — a body of work that solo focus sessions get tagged against
-- ---------------------------------------------------------------------------
create table if not exists public.today_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  color text,
  created_at timestamptz not null default now()
);

create index if not exists idx_today_projects_user
  on public.today_projects (user_id, created_at);

-- ---------------------------------------------------------------------------
-- focus_sessions — extend the existing team/room table with solo fields
-- ---------------------------------------------------------------------------
alter table public.focus_sessions
  add column if not exists project_id uuid
    references public.today_projects (id) on delete set null;
alter table public.focus_sessions
  add column if not exists task_text text;
alter table public.focus_sessions
  add column if not exists estimate_min integer;

-- ---------------------------------------------------------------------------
-- session_notes — extend with solo fields; allow the 'capture' ritual type
-- ---------------------------------------------------------------------------
alter table public.session_notes
  add column if not exists project_id uuid
    references public.today_projects (id) on delete set null;
alter table public.session_notes
  add column if not exists blockers text;
alter table public.session_notes
  add column if not exists actual_min integer;

-- Replace whatever check currently guards ritual_type with a wider one.
do $$
declare
  con_name text;
begin
  select c.conname into con_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
   where t.relname = 'session_notes'
     and c.contype = 'c'
     and a.attname = 'ritual_type'
   limit 1;

  if con_name is not null then
    execute format('alter table public.session_notes drop constraint %I', con_name);
  end if;
end $$;

alter table public.session_notes
  drop constraint if exists session_notes_ritual_type_values;
alter table public.session_notes
  add constraint session_notes_ritual_type_values
  check (ritual_type in (
    'checkin', 'checkout', 'intention', 'reflection', 'weekly_review', 'capture'
  ));

-- Indexes for the new solo columns
create index if not exists idx_focus_sessions_project
  on public.focus_sessions (project_id, completed_at);
create index if not exists idx_session_notes_project
  on public.session_notes (project_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.today_projects enable row level security;

drop policy if exists "today_projects owner all" on public.today_projects;
create policy "today_projects owner all" on public.today_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "today_projects public read" on public.today_projects;
create policy "today_projects public read" on public.today_projects
  for select using (true);

-- Solo writes on the shared tables. Additive & owner-scoped only: Postgres ORs
-- permissive policies, so existing team/room policies are unaffected.
drop policy if exists "focus_sessions owner all" on public.focus_sessions;
create policy "focus_sessions owner all" on public.focus_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "session_notes owner all" on public.session_notes;
create policy "session_notes owner all" on public.session_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Aggregate helpers (security definer — public profile/project pages need
-- aggregate stats without exposing raw rows).
-- ---------------------------------------------------------------------------

-- Per-day focus totals for a heatmap. Days with zero activity are omitted.
create or replace function public.get_focus_heatmap(
  p_user_id uuid,
  p_days integer default 365
)
returns table (day date, minutes integer, sessions bigint)
language sql
security definer
set search_path = public
as $$
  select
    (completed_at at time zone 'utc')::date as day,
    (sum(duration_seconds) / 60)::integer as minutes,
    count(*) as sessions
  from public.focus_sessions
  where user_id = p_user_id
    and completed_at > now() - make_interval(days => p_days)
  group by day
  order by day asc;
$$;

-- Headline stats for the auto-generated public profile.
create or replace function public.get_focus_stats(
  p_user_id uuid
)
returns table (
  total_minutes bigint,
  total_sessions bigint,
  days_active bigint,
  last_7d_minutes bigint,
  current_streak bigint
)
language sql
security definer
set search_path = public
as $$
  with totals as (
    select
      coalesce(sum(duration_seconds) / 60, 0) as total_minutes,
      count(*) as total_sessions,
      count(distinct (completed_at at time zone 'utc')::date) as days_active,
      coalesce(sum(duration_seconds) filter (
        where completed_at > now() - interval '7 days'
      ) / 60, 0) as last_7d_minutes
    from public.focus_sessions
    where user_id = p_user_id
  ),
  days as (
    select (completed_at at time zone 'utc')::date as d
    from public.focus_sessions
    where user_id = p_user_id
    group by d
  ),
  streak as (
    select count(*) as current_streak
    from (
      select d, d - (row_number() over (order by d desc))::int as grp
      from days
      where d >= (current_date - 1)
    ) s
    where grp = (select min(grp) from (select d, d - (row_number() over (order by d desc))::int as grp from days where d >= (current_date - 1)) x)
  )
  select
    totals.total_minutes,
    totals.total_sessions,
    totals.days_active,
    totals.last_7d_minutes,
    coalesce(streak.current_streak, 0)
  from totals, streak;
$$;

-- Project summary for a public project page.
create or replace function public.get_project_summary(
  p_project_id uuid
)
returns table (
  name text,
  description text,
  created_at timestamptz,
  owner_username text,
  total_minutes bigint,
  total_sessions bigint,
  shipped_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    tp.name,
    tp.description,
    tp.created_at,
    pf.username,
    coalesce(sum(fs.duration_seconds) / 60, 0),
    count(fs.id),
    count(sn.id)
  from public.today_projects tp
  left join public.profiles pf on pf.id = tp.user_id
  left join public.focus_sessions fs on fs.project_id = tp.id
  left join public.session_notes sn on sn.project_id = tp.id and sn.ritual_type = 'checkout'
  where tp.id = p_project_id
  group by tp.id, pf.username;
$$;

-- Recent shipped notes for a public profile.
create or replace function public.get_recent_shipped(
  p_user_id uuid,
  p_limit integer default 10
)
returns table (
  id uuid,
  body text,
  blockers text,
  actual_min integer,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, body, blockers, actual_min, created_at
  from public.session_notes
  where user_id = p_user_id and ritual_type = 'checkout'
  order by created_at desc
  limit p_limit;
$$;

-- Shipped notes for a specific public project page.
create or replace function public.get_project_shipped(
  p_project_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  body text,
  blockers text,
  actual_min integer,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, body, blockers, actual_min, created_at
  from public.session_notes
  where project_id = p_project_id and ritual_type = 'checkout'
  order by created_at desc
  limit p_limit;
$$;

-- Public list of a user's today-projects (for profile links).
create or replace function public.get_user_projects(
  p_user_id uuid
)
returns table (
  id uuid,
  name text,
  description text,
  color text,
  created_at timestamptz,
  total_minutes bigint,
  total_sessions bigint
)
language sql
security definer
set search_path = public
as $$
  select
    tp.id,
    tp.name,
    tp.description,
    tp.color,
    tp.created_at,
    coalesce(sum(fs.duration_seconds) / 60, 0) as total_minutes,
    count(fs.id) as total_sessions
  from public.today_projects tp
  left join public.focus_sessions fs on fs.project_id = tp.id
  where tp.user_id = p_user_id
  group by tp.id
  order by tp.created_at desc;
$$;

-- Resolve a public profile by username (public /anon safe).
create or replace function public.get_public_profile(
  p_username text
)
returns table (
  id uuid,
  username text,
  displayname text,
  avatar text,
  banner text,
  bio text
)
language sql
security definer
set search_path = public
as $$
  select id, username, displayname, avatar, banner, bio
  from public.profiles
  where lower(username) = lower(p_username)
  limit 1;
$$;

grant execute on function public.get_focus_heatmap(uuid, integer) to anon, authenticated;
grant execute on function public.get_focus_stats(uuid) to anon, authenticated;
grant execute on function public.get_project_summary(uuid) to anon, authenticated;
grant execute on function public.get_recent_shipped(uuid, integer) to anon, authenticated;
grant execute on function public.get_project_shipped(uuid, integer) to anon, authenticated;
grant execute on function public.get_user_projects(uuid) to anon, authenticated;
grant execute on function public.get_public_profile(text) to anon, authenticated;
