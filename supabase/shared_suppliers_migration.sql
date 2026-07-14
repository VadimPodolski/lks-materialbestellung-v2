-- Lieferanten werden von Rohrlaser und 2D-Laser gemeinsam verwendet.
-- Gleichnamige Bereichseintraege werden verlustfrei zusammengefuehrt.

begin;

drop index if exists public.suppliers_area_name_unique_idx;

with ranked as (
  select
    id,
    first_value(id) over (
      partition by lower(trim(name))
      order by
        case when order_area = 'rohrlaser' then 0 else 1 end,
        created_at,
        id
    ) as keeper_id
  from public.suppliers
), duplicates as (
  select id, keeper_id
  from ranked
  where id <> keeper_id
)
update public.material_orders as orders
set supplier_id = duplicates.keeper_id
from duplicates
where orders.supplier_id = duplicates.id;

with ranked as (
  select
    id,
    first_value(id) over (
      partition by lower(trim(name))
      order by
        case when order_area = 'rohrlaser' then 0 else 1 end,
        created_at,
        id
    ) as keeper_id
  from public.suppliers
)
delete from public.suppliers as suppliers
using ranked
where suppliers.id = ranked.id
  and ranked.id <> ranked.keeper_id;

update public.suppliers
set order_area = 'rohrlaser'
where order_area <> 'rohrlaser';

create unique index if not exists suppliers_name_unique_idx
  on public.suppliers (lower(trim(name)));

commit;
