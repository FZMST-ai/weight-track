-- Weight Log schema. Run this once in the Supabase SQL Editor.

create table if not exists public.entries (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  kg         numeric(6, 3) not null check (kg > 0 and kg < 1000),
  note       text not null default '' check (char_length(note) <= 120),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  unit    text not null default 'kg' check (unit in ('kg', 'lb')),
  goal_kg numeric(6, 3) check (goal_kg is null or (goal_kg > 0 and goal_kg < 1000))
);

-- Each person can only see and change their own rows.
alter table public.entries enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Push changes to other open devices instantly.
do $$
begin
  alter publication supabase_realtime add table public.entries, public.profiles;
exception when duplicate_object then null;
end $$;
