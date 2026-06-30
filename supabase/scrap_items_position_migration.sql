alter table scrap_items
add column if not exists order_item_id uuid references order_items(id) on delete set null;

alter table scrap_items
add column if not exists material text;

alter table scrap_items
add column if not exists cross_section text;

alter table scrap_items
add column if not exists length_mm integer;

update scrap_items s
set
  order_item_id = coalesce(s.order_item_id, oi.id),
  material = coalesce(s.material, oi.material),
  cross_section = coalesce(s.cross_section, oi.cross_section),
  length_mm = coalesce(s.length_mm, oi.length_mm)
from order_items oi
where oi.material_order_id = s.material_order_id
  and oi.position = 1
  and (
    s.order_item_id is null
    or s.material is null
    or s.cross_section is null
    or s.length_mm is null
  );
