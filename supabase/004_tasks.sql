-- Tasks per employer (client)
-- Run in Supabase SQL Editor after 002_projects.sql. Safe to run more than once.

create table if not exists tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  employer_id text not null,
  title text not null,
  notes text default '',
  status text not null default 'open',
  priority text not null default 'normal',
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check check (status in ('open', 'done'));

alter table tasks drop constraint if exists tasks_priority_check;
alter table tasks add constraint tasks_priority_check check (priority in ('low', 'normal', 'high'));

create index if not exists idx_tasks_user_employer on tasks(user_id, employer_id);

alter table tasks enable row level security;

drop policy if exists "users_own_tasks" on tasks;
create policy "users_own_tasks" on tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists tasks_updated_at on tasks;
create trigger tasks_updated_at before update on tasks for each row execute function set_updated_at();
