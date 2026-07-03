create table if not exists public.profiles (
  id uuid primary key,
  email text unique,
  full_name text,
  role text default 'user',
  created_at timestamptz default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text default 'user';
alter table public.profiles add column if not exists created_at timestamptz default now();

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
  or exists (
    select 1
    from public.profiles
    where lower(profiles.email) = lower(auth.jwt() ->> 'email')
      and profiles.role = 'admin'
  );
$$;

grant execute on function public.is_admin_user() to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_delete" on public.profiles;

create policy "profiles_select"
on public.profiles
for select
to authenticated
using (true);

create policy "profiles_insert"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "profiles_update"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.is_admin_user())
with check (auth.uid() = id or public.is_admin_user());

create policy "profiles_delete"
on public.profiles
for delete
to authenticated
using (public.is_admin_user());
