-- Rohrlaser-Positionen koennen vor der Bestellung aus dem Lager bedient werden.
alter table public.order_items
  add column if not exists is_stock_item boolean not null default false;

comment on column public.order_items.is_stock_item is
  'Position wird aus dem Lager bedient und nicht an den Lieferanten bestellt.';
