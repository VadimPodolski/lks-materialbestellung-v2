-- Materialstaerken je 2D-Laser-Material und Speicherung an der Bestellposition.
begin;

alter table public.order_items
  add column if not exists material_thickness_mm numeric(10,3);

alter table public.order_items
  drop constraint if exists order_items_material_thickness_positive,
  add constraint order_items_material_thickness_positive
    check (material_thickness_mm is null or material_thickness_mm > 0);

create table if not exists public.material_thicknesses (
  id uuid primary key default gen_random_uuid(),
  order_area text not null default '2d-laser' check (order_area = '2d-laser'),
  material text not null check (btrim(material) <> ''),
  thickness_mm numeric(10,3) not null check (thickness_mm > 0),
  created_at timestamptz not null default now(),
  unique (order_area, material, thickness_mm)
);

alter table public.material_thicknesses enable row level security;

drop policy if exists material_thicknesses_select on public.material_thicknesses;
drop policy if exists material_thicknesses_insert on public.material_thicknesses;
drop policy if exists material_thicknesses_update on public.material_thicknesses;
drop policy if exists material_thicknesses_delete on public.material_thicknesses;

create policy material_thicknesses_select on public.material_thicknesses
  for select to authenticated using (true);
create policy material_thicknesses_insert on public.material_thicknesses
  for insert to authenticated with check (true);
create policy material_thicknesses_update on public.material_thicknesses
  for update to authenticated
  using (public.is_admin_user()) with check (public.is_admin_user());
create policy material_thicknesses_delete on public.material_thicknesses
  for delete to authenticated using (public.is_admin_user());

grant select, insert, update, delete on public.material_thicknesses to authenticated;
grant select, insert, update, delete on public.material_thicknesses to service_role;

insert into public.material_thicknesses (order_area, material, thickness_mm)
select distinct '2d-laser', oi.material, oi.material_thickness_mm
from public.order_items oi
join public.material_orders mo on mo.id = oi.material_order_id
where mo.order_area = '2d-laser'
  and oi.material_thickness_mm is not null
on conflict (order_area, material, thickness_mm) do nothing;

commit;
