-- Automatische TAFEL-Nummern und Verpackungseinheiten fuer 2D-Laser.
begin;

create sequence if not exists public.tafel_order_number_seq;

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

create or replace function public.next_tafel_order_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'TAFEL-' || lpad(nextval('public.tafel_order_number_seq')::text, 5, '0');
$$;

revoke all on function public.next_tafel_order_number() from public;
grant execute on function public.next_tafel_order_number() to authenticated;

create or replace function public.peek_next_tafel_order_number()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'TAFEL-' || lpad(
    (case when is_called then last_value + 1 else last_value end)::text,
    5,
    '0'
  )
  from public.tafel_order_number_seq;
$$;

revoke all on function public.peek_next_tafel_order_number() from public;
grant execute on function public.peek_next_tafel_order_number() to authenticated;

alter table public.order_items
  add column if not exists order_unit text not null default 'stück',
  add column if not exists pieces_per_package integer;

alter table public.order_items
  drop constraint if exists order_items_order_unit_check,
  drop constraint if exists order_items_pieces_per_package_check;

alter table public.order_items
  add constraint order_items_order_unit_check
    check (order_unit in ('stück', 'paket', 'kg')),
  add constraint order_items_pieces_per_package_check
    check (
      (order_unit in ('stück', 'kg') and pieces_per_package is null)
      or
      (order_unit = 'paket' and pieces_per_package > 0)
    );

commit;
