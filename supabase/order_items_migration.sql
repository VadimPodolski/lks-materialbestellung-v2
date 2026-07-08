create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  material_order_id uuid not null references material_orders(id) on delete cascade,
  position integer not null default 1,
  material text not null,
  cross_section text not null,
  av_1 text,
  av_2 text,
  av_3 text,
  av_4 text,
  length_mm integer,
  quantity integer not null check (quantity > 0),
  created_at timestamptz default now()
);

alter table order_items
  add column if not exists av_1 text,
  add column if not exists av_2 text,
  add column if not exists av_3 text,
  add column if not exists av_4 text;

alter table order_items enable row level security;

do $$
begin
  create policy "order_items_select" on order_items for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "order_items_insert" on order_items for insert to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "order_items_update" on order_items for update to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "order_items_delete" on order_items for delete to authenticated using (true);
exception when duplicate_object then null;
end $$;

insert into order_items (
  material_order_id,
  position,
  material,
  cross_section,
  length_mm,
  quantity
)
select
  mo.id,
  1,
  mo.material,
  mo.cross_section,
  mo.length_mm,
  mo.quantity
from material_orders mo
where not exists (
  select 1
  from order_items oi
  where oi.material_order_id = mo.id
);
