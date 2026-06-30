-- LKS Materialbestellung - kostenlose V1
-- In Supabase SQL Editor ausführen.

create extension if not exists pgcrypto;

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  contact_person text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists material_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  customer text not null,
  supplier_id uuid references suppliers(id) on delete set null,
  material text not null,
  cross_section text not null,
  length_mm integer,
  quantity integer not null check (quantity > 0),
  desired_delivery_date date,
  status text not null default 'offen' check (status in ('offen','bestellt','teilweise_geliefert','geliefert','storniert')),
  notes text,
  created_by uuid references auth.users(id),
  ordered_by uuid references auth.users(id),
  ordered_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  material_order_id uuid not null references material_orders(id) on delete cascade,
  position integer not null default 1,
  material text not null,
  cross_section text not null,
  length_mm integer,
  quantity integer not null check (quantity > 0),
  created_at timestamptz default now()
);

create table if not exists goods_receipts (
  id uuid primary key default gen_random_uuid(),
  material_order_id uuid not null references material_orders(id) on delete cascade,
  received_quantity integer not null check (received_quantity > 0),
  delivery_note_number text,
  notes text,
  received_by uuid references auth.users(id),
  received_at timestamptz default now()
);

create table if not exists order_history (
  id uuid primary key default gen_random_uuid(),
  material_order_id uuid not null references material_orders(id) on delete cascade,
  action text not null,
  old_status text,
  new_status text,
  user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table suppliers enable row level security;
alter table material_orders enable row level security;
alter table order_items enable row level security;
alter table goods_receipts enable row level security;
alter table order_history enable row level security;

-- Einfache interne Lösung: eingeloggte Nutzer dürfen alles lesen/schreiben.
create policy "suppliers_select" on suppliers for select to authenticated using (true);
create policy "suppliers_insert" on suppliers for insert to authenticated with check (true);
create policy "suppliers_update" on suppliers for update to authenticated using (true);
create policy "suppliers_delete" on suppliers for delete to authenticated using (true);

create policy "orders_select" on material_orders for select to authenticated using (true);
create policy "orders_insert" on material_orders for insert to authenticated with check (auth.uid() = created_by or created_by is null);
create policy "orders_update" on material_orders for update to authenticated using (true);
create policy "orders_delete" on material_orders for delete to authenticated using (true);

create policy "order_items_select" on order_items for select to authenticated using (true);
create policy "order_items_insert" on order_items for insert to authenticated with check (true);
create policy "order_items_update" on order_items for update to authenticated using (true);
create policy "order_items_delete" on order_items for delete to authenticated using (true);

create policy "receipts_select" on goods_receipts for select to authenticated using (true);
create policy "receipts_insert" on goods_receipts for insert to authenticated with check (auth.uid() = received_by or received_by is null);
create policy "receipts_update" on goods_receipts for update to authenticated using (true);
create policy "receipts_delete" on goods_receipts for delete to authenticated using (true);

create policy "history_select" on order_history for select to authenticated using (true);
create policy "history_insert" on order_history for insert to authenticated with check (auth.uid() = user_id or user_id is null);

insert into suppliers (name, email, phone, contact_person, notes)
values ('Beispiellieferant Stahl', 'bestellung@example.com', '', '', 'Bitte durch echten Lieferanten ersetzen')
on conflict do nothing;
