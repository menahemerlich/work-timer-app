-- Projects per employer (hourly / fixed price / per unit)
-- Run in Supabase SQL Editor after 001_initial.sql. Safe to run more than once.

alter table employers add column if not exists hourly_rate numeric;

create table if not exists projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  employer_id text not null,
  name text not null,
  billing_type text not null default 'hourly',
  fixed_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table projects add column if not exists unit_price numeric;
alter table projects add column if not exists unit_name text;
alter table projects add column if not exists unit_singular text;

alter table projects drop constraint if exists projects_billing_type_check;
alter table projects add constraint projects_billing_type_check
  check (billing_type in ('hourly', 'fixed', 'unit'));

create index if not exists idx_projects_user_employer on projects(user_id, employer_id);

alter table work_logs add column if not exists project_id text;
alter table work_logs add column if not exists project_name text;
alter table work_logs add column if not exists unit_count integer;
alter table work_logs add column if not exists unit_open boolean not null default false;

alter table timer_state add column if not exists project_id text;
alter table timer_state add column if not exists project_name text;
alter table timer_state add column if not exists unit_count integer;

alter table projects enable row level security;

drop policy if exists "users_own_projects" on projects;
create policy "users_own_projects" on projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at before update on projects for each row execute function set_updated_at();
