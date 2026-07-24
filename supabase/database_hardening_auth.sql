-- LKS Materialbestellung - Datenbank-Hardening
-- Nicht-destruktiv im Supabase SQL Editor ausführen.
-- Vorher geprüft: keine Dubletten in Kunden, Lieferanten, Materialien, Querschnitten, AV oder Auftragsnummern.

create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  email text,
  phone text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz default now()
);

alter table public.customers add column if not exists contact_person text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists notes text;
alter table public.customers add column if not exists created_at timestamptz default now();

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists created_at timestamptz default now();

do $$
begin
  alter table public.profiles
    add constraint profiles_role_check check (role in ('user', 'admin'));
exception when duplicate_object then null;
end $$;

create unique index if not exists customers_name_unique_idx on public.customers (lower(trim(name)));
create unique index if not exists suppliers_name_unique_idx on public.suppliers (lower(trim(name)));
create unique index if not exists materials_name_unique_idx on public.materials (lower(trim(name)));
create unique index if not exists cross_sections_name_unique_idx on public.cross_sections (lower(trim(name)));
create unique index if not exists work_preparations_name_unique_idx on public.work_preparations (lower(trim(name)));
create unique index if not exists material_orders_order_number_unique_idx
  on public.material_orders (lower(trim(order_number)))
  where lower(trim(order_number)) <> 'ab-lager';
create unique index if not exists order_items_order_position_unique_idx on public.order_items (material_order_id, position);

create index if not exists material_orders_status_idx on public.material_orders (status);
create index if not exists material_orders_created_at_idx on public.material_orders (created_at desc);
create index if not exists material_orders_supplier_idx on public.material_orders (supplier_id);
create index if not exists order_items_material_order_idx on public.order_items (material_order_id);
create index if not exists goods_receipts_material_order_idx on public.goods_receipts (material_order_id);
create index if not exists scrap_items_material_order_idx on public.scrap_items (material_order_id);
create index if not exists order_pdfs_material_order_idx on public.order_pdfs (material_order_id);

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

alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.materials enable row level security;
alter table public.cross_sections enable row level security;
alter table public.work_preparations enable row level security;
alter table public.profiles enable row level security;
alter table public.material_orders enable row level security;
alter table public.order_items enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.scrap_items enable row level security;
alter table public.order_history enable row level security;
alter table public.order_pdfs enable row level security;

-- Stammdaten: alle angemeldeten Nutzer dürfen lesen und anlegen,
-- Bearbeiten/Löschen bleibt Admins vorbehalten.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['customers', 'suppliers', 'materials', 'cross_sections', 'work_preparations']
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete', table_name);

    execute format('create policy %I on public.%I for select to authenticated using (true)', table_name || '_select', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', table_name || '_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user())', table_name || '_update', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin_user())', table_name || '_delete', table_name);
  end loop;
end $$;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;

create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy profiles_update on public.profiles for update to authenticated using (auth.uid() = id or public.is_admin_user()) with check (auth.uid() = id or public.is_admin_user());
create policy profiles_delete on public.profiles for delete to authenticated using (public.is_admin_user());
