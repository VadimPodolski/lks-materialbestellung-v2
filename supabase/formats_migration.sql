-- Eigene Blechformate fuer den Fertigungsbereich 2D-Laser.
begin;

create table if not exists public.formats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  width_mm integer not null check (width_mm > 0),
  height_mm integer not null check (height_mm > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists formats_dimensions_unique_idx
  on public.formats (width_mm, height_mm);

alter table public.formats enable row level security;

drop policy if exists formats_select on public.formats;
drop policy if exists formats_insert on public.formats;
drop policy if exists formats_update on public.formats;
drop policy if exists formats_delete on public.formats;

create policy formats_select on public.formats
  for select to authenticated using (true);
create policy formats_insert on public.formats
  for insert to authenticated with check (true);
create policy formats_update on public.formats
  for update to authenticated
  using (public.is_admin_user()) with check (public.is_admin_user());
create policy formats_delete on public.formats
  for delete to authenticated using (public.is_admin_user());

insert into public.formats (name, width_mm, height_mm)
values
  ('Großformat', 3000, 1500),
  ('Mittelformat', 2500, 1250),
  ('Kleinformat', 2000, 1000)
on conflict (width_mm, height_mm) do update set name = excluded.name;

commit;
