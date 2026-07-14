-- Ergaenzt kg als Einheit und erlaubt Dezimalmengen fuer Bestellungen und Buchungen.
begin;

alter table public.order_items
  drop constraint if exists order_items_order_unit_check,
  drop constraint if exists order_items_pieces_per_package_check;

alter table public.order_items
  alter column quantity type numeric(12,2) using quantity::numeric;

alter table public.material_orders
  alter column quantity type numeric(12,2) using quantity::numeric;

alter table public.goods_receipts
  alter column received_quantity type numeric(12,2) using received_quantity::numeric;

alter table public.scrap_items
  alter column quantity type numeric(12,2) using quantity::numeric;

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
