-- Vergibt auch bestehenden 2D-Laser-Auftraegen fortlaufende TAFEL-Nummern.
begin;

with current_max as (
  select coalesce(max(substring(order_number from '^TAFEL-([0-9]+)$')::bigint), 0) as value
  from public.material_orders
  where order_area = '2d-laser'
    and order_number ~ '^TAFEL-[0-9]+$'
),
numbered as (
  select
    orders.id,
    current_max.value + row_number() over (order by orders.created_at, orders.id) as next_number
  from public.material_orders orders
  cross join current_max
  where orders.order_area = '2d-laser'
    and orders.order_number !~ '^TAFEL-[0-9]+$'
)
update public.material_orders orders
set order_number = 'TAFEL-' || lpad(numbered.next_number::text, 5, '0')
from numbered
where orders.id = numbered.id;

do $$
declare
  max_number bigint;
begin
  select max(substring(order_number from '^TAFEL-([0-9]+)$')::bigint)
    into max_number
  from public.material_orders
  where order_area = '2d-laser'
    and order_number ~ '^TAFEL-[0-9]+$';

  perform setval(
    'public.tafel_order_number_seq',
    coalesce(max_number, 1),
    max_number is not null
  );
end $$;

commit;
