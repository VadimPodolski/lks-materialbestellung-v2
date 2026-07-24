begin;

drop index if exists public.material_orders_area_number_unique_idx;

create unique index material_orders_area_number_unique_idx
  on public.material_orders (order_area, lower(trim(order_number)))
  where lower(trim(order_number)) <> 'ab-lager';

commit;
