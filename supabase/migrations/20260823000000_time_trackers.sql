-- SkillHive — time tracker integration (Wakatime + Hackatime)
--
-- NON-DESTRUCTIVE: only creates new tables/columns/policies/RPCs. Existing
-- tables (rooms/teams/today_projects) are never altered destructively.
--
-- Model (Hack Club style, per-project mapping):
--   1. time_tracker_connections        — one per user; provider + api key
--   2. time_tracker_projects_raw       — synced raw data from the tracker API
--   3. time_tracker_project_mappings   — links tracker projects → today_projects
--   4. project_coding_time             — denormalized aggregate per today_project
--   5. user_coding_stats               — denormalized user-level totals
--
-- Privacy: everything is opt-in. project_coding_time.is_public and
-- user_coding_stats.is_public default to false; the owner flips them.

-- ---------------------------------------------------------------------------
-- 1. Connections — one row per user
-- ---------------------------------------------------------------------------
create table if not exists public.time_tracker_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  provider text not null default 'wakatime'
    check (provider in ('wakatime', 'hackatime')),
  api_key text not null,
  status text not null default 'active' check (status in ('active', 'error', 'disabled')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.time_tracker_connections enable row level security;

drop policy if exists "time_tracker_connections owner all" on public.time_tracker_connections;
create policy "time_tracker_connections owner all" on public.time_tracker_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Raw synced projects (written by the sync engine via service role)
-- ---------------------------------------------------------------------------
create table if not exists public.time_tracker_projects_raw (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  connection_id uuid not null references public.time_tracker_connections (user_id) on delete cascade,
  tracker_project_id text not null,
  name text not null,
  total_seconds bigint not null default 0,
  languages jsonb not null default '[]'::jsonb,  -- [{name, total_seconds}]
  daily jsonb not null default '[]'::jsonb,      -- [{date: YYYY-MM-DD, seconds}]
  last_coded_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (connection_id, tracker_project_id)
);

create index if not exists idx_ttr_raw_user
  on public.time_tracker_projects_raw (user_id);
create index if not exists idx_ttr_raw_connection
  on public.time_tracker_projects_raw (connection_id);

alter table public.time_tracker_projects_raw enable row level security;

-- Owner read-only; writes happen through the sync engine's service role.
drop policy if exists "ttr_raw owner read" on public.time_tracker_projects_raw;
create policy "ttr_raw owner read" on public.time_tracker_projects_raw
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Mappings — many tracker projects → one SkillHive project (monorepo split)
-- ---------------------------------------------------------------------------
create table if not exists public.time_tracker_project_mappings (
  id uuid primary key default gen_random_uuid(),
  skillhive_project_id uuid not null references public.today_projects (id) on delete cascade,
  connection_id uuid not null references public.time_tracker_connections (user_id) on delete cascade,
  tracker_project_id text not null,
  created_at timestamptz not null default now(),
  unique (skillhive_project_id, tracker_project_id)
);

create index if not exists idx_ttr_map_project
  on public.time_tracker_project_mappings (skillhive_project_id);

alter table public.time_tracker_project_mappings enable row level security;

-- Owner-scoped both ways: must own the project AND the connection.
drop policy if exists "ttr_map owner all" on public.time_tracker_project_mappings;
create policy "ttr_map owner all" on public.time_tracker_project_mappings
  for all using (
    exists (
      select 1 from public.today_projects tp
      where tp.id = skillhive_project_id and tp.user_id = auth.uid()
    )
    and exists (
      select 1 from public.time_tracker_connections c
      where c.user_id = auth.uid() and c.user_id = connection_id
    )
  )
  with check (
    exists (
      select 1 from public.today_projects tp
      where tp.id = skillhive_project_id and tp.user_id = auth.uid()
    )
    and exists (
      select 1 from public.time_tracker_connections c
      where c.user_id = auth.uid() and c.user_id = connection_id
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Denormalized per-project coding time
-- ---------------------------------------------------------------------------
create table if not exists public.project_coding_time (
  project_id uuid primary key references public.today_projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  total_seconds bigint not null default 0,
  language_breakdown jsonb not null default '[]'::jsonb,
  daily_breakdown jsonb not null default '[]'::jsonb,
  last_coded_at timestamptz,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_pct_user on public.project_coding_time (user_id);

alter table public.project_coding_time enable row level security;

drop policy if exists "pct read" on public.project_coding_time;
create policy "pct read" on public.project_coding_time
  for select using (is_public or auth.uid() = user_id);

drop policy if exists "pct owner write" on public.project_coding_time;
create policy "pct owner write" on public.project_coding_time
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. Denormalized user-level coding stats
-- ---------------------------------------------------------------------------
create table if not exists public.user_coding_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  total_seconds bigint not null default 0,
  language_breakdown jsonb not null default '[]'::jsonb,
  daily_breakdown jsonb not null default '[]'::jsonb,
  current_streak_days integer not null default 0,
  longest_streak_days integer not null default 0,
  last_coded_at timestamptz,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_coding_stats enable row level security;

drop policy if exists "ucs read" on public.user_coding_stats;
create policy "ucs read" on public.user_coding_stats
  for select using (is_public or auth.uid() = user_id);

drop policy if exists "ucs owner write" on public.user_coding_stats;
create policy "ucs owner write" on public.user_coding_stats
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPCs — connections management (owner only, key never echoed back)
-- ---------------------------------------------------------------------------

-- Current user's connection status (api_key intentionally omitted).
create or replace function public.get_my_tracker_connection()
returns table (
  provider text,
  status text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select provider, status, last_sync_at, last_error, created_at
  from public.time_tracker_connections
  where user_id = auth.uid();
$$;

create or replace function public.save_tracker_connection(
  p_provider text,
  p_api_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.time_tracker_connections (user_id, provider, api_key, status)
  values (auth.uid(), p_provider, p_api_key, 'active')
  on conflict (user_id) do update
    set provider = excluded.provider,
        api_key = excluded.api_key,
        status = 'active',
        last_error = null;
end;
$$;

create or replace function public.delete_tracker_connection()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.time_tracker_connections where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- RPCs — picker + mapping management
-- ---------------------------------------------------------------------------

-- The signed-in user's synced tracker projects (for the link picker modal).
create or replace function public.get_my_tracker_projects()
returns table (
  tracker_project_id text,
  name text,
  total_seconds bigint,
  languages jsonb,
  last_coded_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.tracker_project_id, r.name, r.total_seconds, r.languages, r.last_coded_at
  from public.time_tracker_projects_raw r
  join public.time_tracker_connections c on c.user_id = r.user_id
  where r.user_id = auth.uid()
  order by r.total_seconds desc;
$$;

-- Mappings for one of my projects.
create or replace function public.get_project_tracker_mappings(
  p_project_id uuid
)
returns table (
  tracker_project_id text,
  name text,
  total_seconds bigint
)
language sql
security definer
set search_path = public
as $$
  select m.tracker_project_id, r.name, r.total_seconds
  from public.time_tracker_project_mappings m
  join public.today_projects tp on tp.id = m.skillhive_project_id
  left join public.time_tracker_projects_raw r
    on r.connection_id = m.connection_id
   and r.tracker_project_id = m.tracker_project_id
  where m.skillhive_project_id = p_project_id
    and tp.user_id = auth.uid();
$$;

-- Link tracker projects to a SkillHive project, then reaggregate so new
-- numbers show up instantly (no waiting for next cron).
create or replace function public.link_tracker_projects(
  p_skillhive_project_id uuid,
  p_tracker_project_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_connection uuid;
begin
  select user_id into v_owner from public.today_projects
  where id = p_skillhive_project_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not your project';
  end if;

  select user_id into v_connection from public.time_tracker_connections
  where user_id = auth.uid();
  if v_connection is null then
    raise exception 'no tracker connected';
  end if;

  insert into public.time_tracker_project_mappings
    (skillhive_project_id, connection_id, tracker_project_id)
  select p_skillhive_project_id, v_connection, unnest(p_tracker_project_ids)
  on conflict (skillhive_project_id, tracker_project_id) do nothing;

  perform public.reaggregate_tracker_time(auth.uid());
end;
$$;

-- Unlink one tracker project (null = unlink everything).
create or replace function public.unlink_tracker_projects(
  p_skillhive_project_id uuid,
  p_tracker_project_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tracker_project_id is null then
    delete from public.time_tracker_project_mappings m
    using public.today_projects tp
    where tp.id = m.skillhive_project_id
      and tp.id = p_skillhive_project_id
      and tp.user_id = auth.uid();
  else
    delete from public.time_tracker_project_mappings m
    using public.today_projects tp
    where tp.id = m.skillhive_project_id
      and tp.id = p_skillhive_project_id
      and tp.user_id = auth.uid()
      and m.tracker_project_id = p_tracker_project_id;
  end if;

  perform public.reaggregate_tracker_time(auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs — visibility toggles (owner only)
-- ---------------------------------------------------------------------------
create or replace function public.set_project_coding_visibility(
  p_project_id uuid,
  p_is_public boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.project_coding_time
  set is_public = p_is_public, updated_at = now()
  where project_id = p_project_id and user_id = auth.uid();
$$;

create or replace function public.set_my_coding_stats_visibility(
  p_is_public boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_coding_stats (user_id, is_public)
  values (auth.uid(), p_is_public)
  on conflict (user_id) do update set is_public = excluded.is_public;
$$;

-- ---------------------------------------------------------------------------
-- RPCs — public readers (anon safe, privacy enforced)
-- ---------------------------------------------------------------------------
create or replace function public.get_project_coding_time(
  p_project_id uuid
)
returns table (
  total_seconds bigint,
  language_breakdown jsonb,
  last_coded_at timestamptz,
  is_public boolean
)
language sql
security definer
set search_path = public
as $$
  select ct.total_seconds, ct.language_breakdown, ct.last_coded_at, ct.is_public
  from public.project_coding_time ct
  where ct.project_id = p_project_id
    and (ct.is_public or ct.user_id = auth.uid());
$$;

create or replace function public.get_user_coding_time(
  p_user_id uuid
)
returns table (
  total_seconds bigint,
  language_breakdown jsonb,
  daily_breakdown jsonb,
  current_streak_days integer,
  longest_streak_days integer,
  last_coded_at timestamptz,
  is_public boolean
)
language sql
security definer
set search_path = public
as $$
  select s.total_seconds, s.language_breakdown, s.daily_breakdown,
         s.current_streak_days, s.longest_streak_days, s.last_coded_at, s.is_public
  from public.user_coding_stats s
  where s.user_id = p_user_id
    and (s.is_public or s.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Reaggregation — called after sync and after mapping changes.
-- Caller must be the user themself or the service role (sync engine).
-- ---------------------------------------------------------------------------
create or replace function public.reaggregate_tracker_time(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is distinct from auth.uid() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden';
  end if;

  -- ── Per-project aggregates (mapped tracker projects → SkillHive projects) ──
  insert into public.project_coding_time
    (project_id, user_id, total_seconds, language_breakdown, daily_breakdown, last_coded_at, updated_at)
  with proj_raw as (
    select
      m.skillhive_project_id as project_id,
      r.total_seconds,
      r.languages,
      r.daily,
      r.last_coded_at
    from public.time_tracker_project_mappings m
    join public.time_tracker_projects_raw r
      on r.connection_id = m.connection_id
     and r.tracker_project_id = m.tracker_project_id
    where r.user_id = p_user_id
  ),
  langs as (
    select pr.project_id, e->>'name' as name, sum((e->>'total_seconds')::bigint) as seconds
    from proj_raw pr, jsonb_array_elements(pr.languages) e
    group by 1, 2
  ),
  days as (
    select pr.project_id, e->>'date' as date, sum((e->>'seconds')::bigint) as seconds
    from proj_raw pr, jsonb_array_elements(pr.daily) e
    group by 1, 2
  )
  select
    pr.project_id,
    p_user_id,
    sum(pr.total_seconds)::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name, 'total_seconds', l.seconds) order by l.seconds desc)
      from langs l where l.project_id = pr.project_id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('date', d.date, 'seconds', d.seconds) order by d.date)
      from days d where d.project_id = pr.project_id
    ), '[]'::jsonb),
    max(pr.last_coded_at),
    now()
  from proj_raw pr
  group by pr.project_id
  on conflict (project_id) do update set
    total_seconds = excluded.total_seconds,
    language_breakdown = excluded.language_breakdown,
    daily_breakdown = excluded.daily_breakdown,
    last_coded_at = excluded.last_coded_at,
    updated_at = now();

  -- Zero out aggregates for projects whose mappings were all removed —
  -- rows stay (keeping the owner's visibility preference), data goes.
  update public.project_coding_time ct
  set total_seconds = 0,
      language_breakdown = '[]'::jsonb,
      daily_breakdown = '[]'::jsonb,
      last_coded_at = null,
      updated_at = now()
  where ct.user_id = p_user_id
    and not exists (
      select 1 from public.time_tracker_project_mappings m
      where m.skillhive_project_id = ct.project_id
    );

  -- ── User-level totals across ALL tracked coding (mapped or not) ───────────
  insert into public.user_coding_stats
    (user_id, total_seconds, language_breakdown, daily_breakdown,
     current_streak_days, longest_streak_days, last_coded_at, updated_at, is_public)
  with all_raw as (
    select total_seconds, languages, daily, last_coded_at
    from public.time_tracker_projects_raw
    where user_id = p_user_id
  ),
  langs as (
    select e->>'name' as name, sum((e->>'total_seconds')::bigint) as seconds
    from all_raw pr, jsonb_array_elements(pr.languages) e
    group by 1
  ),
  days as (
    select e->>'date' as date, sum((e->>'seconds')::bigint) as seconds
    from all_raw pr, jsonb_array_elements(pr.daily) e
    group by 1
  ),
  day_rows as (
    select to_date(date, 'YYYY-MM-DD') as d from days
  ),
  runs as (
    select
      count(*) as run_len,
      min(d) as run_start,
      max(d) as run_end
    from (
      select d, d - (row_number() over (order by d))::int as grp
      from day_rows
    ) g
    group by grp
  ),
  streaks as (
    select
      coalesce((select run_len from runs
                where run_end >= current_date - 1
                order by run_end desc limit 1), 0) as current_streak,
      coalesce((select max(run_len) from runs), 0) as longest_streak
  )
  select
    p_user_id,
    coalesce(sum(pr.total_seconds), 0)::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name, 'total_seconds', l.seconds) order by l.seconds desc)
      from langs l
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('date', d.date, 'seconds', d.seconds) order by d.date)
      from days d
    ), '[]'::jsonb),
    streaks.current_streak,
    streaks.longest_streak,
    max(pr.last_coded_at),
    now(),
    coalesce(prev.is_public, false)
  from all_raw pr
  cross join streaks
  left join public.user_coding_stats prev on prev.user_id = p_user_id
  group by streaks.current_streak, streaks.longest_streak, prev.is_public
  on conflict (user_id) do update set
    total_seconds = excluded.total_seconds,
    language_breakdown = excluded.language_breakdown,
    daily_breakdown = excluded.daily_breakdown,
    current_streak_days = excluded.current_streak_days,
    longest_streak_days = excluded.longest_streak_days,
    last_coded_at = excluded.last_coded_at,
    updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Additive: expose owner_id on project summaries (needed for owner-only UI,
-- e.g. the per-project tracker connect card). Same shape, one new column.
-- NOTE: the return type changes, so CREATE OR REPLACE alone would fail —
-- drop first. RPC callers (PostgREST) resolve by name, so this is seamless.
-- ---------------------------------------------------------------------------
drop function if exists public.get_project_summary(uuid);
create function public.get_project_summary(
  p_project_id uuid
)
returns table (
  name text,
  description text,
  created_at timestamptz,
  owner_username text,
  owner_id uuid,
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
    tp.user_id,
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function public.get_my_tracker_connection() to authenticated;
grant execute on function public.save_tracker_connection(text, text) to authenticated;
grant execute on function public.delete_tracker_connection() to authenticated;
grant execute on function public.get_my_tracker_projects() to authenticated;
grant execute on function public.get_project_tracker_mappings(uuid) to authenticated;
grant execute on function public.link_tracker_projects(uuid, text[]) to authenticated;
grant execute on function public.unlink_tracker_projects(uuid, text) to authenticated;
grant execute on function public.set_project_coding_visibility(uuid, boolean) to authenticated;
grant execute on function public.set_my_coding_stats_visibility(boolean) to authenticated;
grant execute on function public.get_project_coding_time(uuid) to anon, authenticated;
grant execute on function public.get_user_coding_time(uuid) to anon, authenticated;
-- Re-grant after the drop/recreate above (ACLs die with the dropped function).
grant execute on function public.get_project_summary(uuid) to anon, authenticated;
