-- Supabase schema for Work Timer app
-- Run in Supabase SQL Editor

create table if not exists employers (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  color text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, name)
);

create table if not exists work_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  start_time text not null,
  end_time text not null,
  duration_ms bigint not null,
  duration_str text not null,
  employer_id text references employers(id) on delete set null,
  employer_name text not null,
  note text default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_work_logs_user_date on work_logs(user_id, date);
create index if not exists idx_work_logs_user_employer on work_logs(user_id, employer_id);

create table if not exists app_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists timer_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  elapsed_ms bigint not null default 0,
  is_paused boolean not null default false,
  is_running boolean not null default false,
  employer_id text,
  employer_name text,
  original_start_time timestamptz,
  segment_start_time timestamptz,
  session_note text default '',
  updated_at timestamptz not null default now()
);

-- RLS
alter table employers enable row level security;
alter table work_logs enable row level security;
alter table app_settings enable row level security;
alter table timer_state enable row level security;

create policy "users_own_employers" on employers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_own_work_logs" on work_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_own_app_settings" on app_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_own_timer_state" on timer_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at trigger helper
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger employers_updated_at before update on employers for each row execute function set_updated_at();
create trigger work_logs_updated_at before update on work_logs for each row execute function set_updated_at();
create trigger app_settings_updated_at before update on app_settings for each row execute function set_updated_at();
create trigger timer_state_updated_at before update on timer_state for each row execute function set_updated_at();
