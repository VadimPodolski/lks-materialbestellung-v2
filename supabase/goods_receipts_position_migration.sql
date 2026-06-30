alter table goods_receipts
add column if not exists order_item_id uuid references order_items(id) on delete set null;

alter table goods_receipts
add column if not exists material text;

alter table goods_receipts
add column if not exists cross_section text;

alter table goods_receipts
add column if not exists length_mm integer;

update goods_receipts r
set
  order_item_id = coalesce(r.order_item_id, oi.id),
  material = coalesce(r.material, oi.material),
  cross_section = coalesce(r.cross_section, oi.cross_section),
  length_mm = coalesce(r.length_mm, oi.length_mm)
from order_items oi
where oi.material_order_id = r.material_order_id
  and oi.position = 1
  and (
    r.order_item_id is null
    or r.material is null
    or r.cross_section is null
    or r.length_mm is null
  );
