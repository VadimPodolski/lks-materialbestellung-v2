-- Positionspreise aus Lieferanten-Auftragsbestaetigungen.

begin;

alter table public.order_items
  add column if not exists price_quantity numeric(14, 3),
  add column if not exists price_unit text,
  add column if not exists unit_price_eur numeric(14, 4),
  add column if not exists line_total_eur numeric(14, 2);

alter table public.order_items
  drop constraint if exists order_items_price_quantity_positive,
  drop constraint if exists order_items_unit_price_nonnegative,
  drop constraint if exists order_items_line_total_nonnegative;

alter table public.order_items
  add constraint order_items_price_quantity_positive
    check (price_quantity is null or price_quantity > 0),
  add constraint order_items_unit_price_nonnegative
    check (unit_price_eur is null or unit_price_eur >= 0),
  add constraint order_items_line_total_nonnegative
    check (line_total_eur is null or line_total_eur >= 0);

commit;
