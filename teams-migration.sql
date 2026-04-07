-- ─────────────────────────────────────────────────────────────
--  Hockey Drills Lab — Teams migration
--  Run this in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────

-- ── 1. Teams table ───────────────────────────────────────────
create table if not exists team (
  id         bigserial    primary key,
  name       text         not null,
  code       text         not null unique,
  owner_id   uuid         not null references auth.users on delete cascade,
  created_at timestamptz  not null default now()
);

alter table team enable row level security;

-- Drop existing policies first to avoid 42710 error
drop policy if exists "Auth users read teams" on team;
drop policy if exists "Owner manages team" on team;

-- Now recreate them
create policy "Auth users read teams"
  on team for select
  using (auth.role() = 'authenticated');

create policy "Owner manages team"
  on team for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);


-- ── 2. Team membership table ──────────────────────────────────
-- (Repeat the same pattern for team_member)
alter table team_member enable row level security;

drop policy if exists "Members view team roster" on team_member;
drop policy if exists "Users join teams" on team_member;
drop policy if exists "Users leave or owner removes" on team_member;

-- Use the non-recursive fix for the membership roster
create policy "Members view team roster"
  on team_member for select
  using (
    auth.uid() = user_id 
    or team_id in (select id from team where owner_id = auth.uid())
  );


-- Users can add themselves to a team
create policy "Users join teams"
  on team_member for insert
  with check (auth.uid() = user_id);

-- Users can remove themselves (leave), team owner can remove anyone
create policy "Users leave or owner removes"
  on team_member for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from team where id = team_member.team_id and owner_id = auth.uid()
    )
  );


-- ── 3. Add team_id to practice ───────────────────────────────
alter table practice
  add column if not exists team_id bigint references team on delete set null;


-- ── 4. Replace practice RLS policies ─────────────────────────
drop policy if exists "Anyone can view practices"   on practice;
drop policy if exists "Users insert own practices"  on practice;
drop policy if exists "Users update own practices"  on practice;
drop policy if exists "Users delete own practices"  on practice;
drop policy if exists "Users view own or team practices"   on practice;

-- Private by default; visible to team members if team_id is set
create policy "Users view own or team practices"
  on practice for select
  using (
    auth.uid() = user_id
    or (
      team_id is not null
      and exists (
        select 1 from team_member
        where team_member.team_id = practice.team_id
          and team_member.user_id = auth.uid()
      )
    )
  );

create policy "Users insert own practices"
  on practice for insert
  with check (auth.uid() = user_id);

create policy "Users update own practices"
  on practice for update
  using (auth.uid() = user_id);

create policy "Users delete own practices"
  on practice for delete
  using (auth.uid() = user_id);
