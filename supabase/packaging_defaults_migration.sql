-- Merkt sich die Stueckzahl pro Paket fuer jede Material-Format-Kombination.
begin;

create table if not exists public.packaging_defaults (
  lookup_key text primary key,
  order_area text not null default '2d-laser' check (order_area in ('rohrlaser', '2d-laser')),
  material text not null,
  cross_section text not null,
  pieces_per_package integer not null check (pieces_per_package > 0),
  updated_at timestamptz not null default now()
);

alter table public.packaging_defaults enable row level security;

drop policy if exists packaging_defaults_select on public.packaging_defaults;
drop policy if exists packaging_defaults_insert on public.packaging_defaults;
drop policy if exists packaging_defaults_update on public.packaging_defaults;

create policy packaging_defaults_select
  on public.packaging_defaults for select to authenticated using (true);

create policy packaging_defaults_insert
  on public.packaging_defaults for insert to authenticated with check (true);

create policy packaging_defaults_update
  on public.packaging_defaults for update to authenticated using (true) with check (true);

grant select, insert, update on public.packaging_defaults to authenticated;

insert into public.packaging_defaults (
  lookup_key,
  order_area,
  material,
  cross_section,
  pieces_per_package,
  updated_at
)
select distinct on (
  lower(btrim(items.material)),
  lower(btrim(items.cross_section))
)
  '2d-laser|' || lower(btrim(items.material)) || '|' || lower(btrim(items.cross_section)),
  '2d-laser',
  items.material,
  items.cross_section,
  items.pieces_per_package,
  coalesce(items.created_at, now())
from public.order_items items
join public.material_orders orders on orders.id = items.material_order_id
where orders.order_area = '2d-laser'
  and items.order_unit = 'paket'
  and items.pieces_per_package > 0
order by
  lower(btrim(items.material)),
  lower(btrim(items.cross_section)),
  items.created_at desc
on conflict (lookup_key) do nothing;

commit;
