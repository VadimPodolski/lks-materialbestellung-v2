-- Trennt Rohrlaser und 2D-Laser in Bestellungen und Stammdaten.
-- Bestehende Daten werden automatisch dem Rohrlaser zugeordnet.

begin;

alter table public.material_orders
  add column if not exists order_area text not null default 'rohrlaser';
alter table public.customers
  add column if not exists order_area text not null default 'rohrlaser';
alter table public.suppliers
  add column if not exists order_area text not null default 'rohrlaser';
alter table public.materials
  add column if not exists order_area text not null default 'rohrlaser';
alter table public.cross_sections
  add column if not exists order_area text not null default 'rohrlaser';
alter table public.work_preparations
  add column if not exists order_area text not null default 'rohrlaser';

do $$
begin
  alter table public.material_orders
    add constraint material_orders_order_area_check
    check (order_area in ('rohrlaser', '2d-laser'));
exception when duplicate_object then null;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers', 'suppliers', 'materials', 'cross_sections', 'work_preparations'
  ]
  loop
    begin
      execute format(
        'alter table public.%I add constraint %I check (order_area in (''rohrlaser'', ''2d-laser''))',
        table_name,
        table_name || '_order_area_check'
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Alte globale Eindeutigkeiten würden gleiche Namen in beiden Bereichen verhindern.
alter table public.customers drop constraint if exists customers_name_key;
alter table public.suppliers drop constraint if exists suppliers_name_key;
alter table public.materials drop constraint if exists materials_name_key;
alter table public.cross_sections drop constraint if exists cross_sections_name_key;
alter table public.work_preparations drop constraint if exists work_preparations_name_key;

drop index if exists public.customers_name_unique_idx;
drop index if exists public.suppliers_name_unique_idx;
drop index if exists public.materials_name_unique_idx;
drop index if exists public.cross_sections_name_unique_idx;
drop index if exists public.work_preparations_name_unique_idx;
drop index if exists public.material_orders_order_number_unique_idx;

create unique index if not exists customers_area_name_unique_idx
  on public.customers (order_area, lower(trim(name)));
create unique index if not exists suppliers_area_name_unique_idx
  on public.suppliers (order_area, lower(trim(name)));
create unique index if not exists materials_area_name_unique_idx
  on public.materials (order_area, lower(trim(name)));
create unique index if not exists cross_sections_area_name_unique_idx
  on public.cross_sections (order_area, lower(trim(name)));
create unique index if not exists work_preparations_area_name_unique_idx
  on public.work_preparations (order_area, lower(trim(name)));
create unique index if not exists material_orders_area_number_unique_idx
  on public.material_orders (order_area, lower(trim(order_number)))
  where lower(trim(order_number)) <> 'ab-lager';

create index if not exists material_orders_area_created_idx
  on public.material_orders (order_area, created_at desc);

commit;
