-- Mehrere AB-PDFs pro Auftrag.
-- In Supabase SQL Editor ausführen.

create table if not exists order_pdfs (
  id uuid primary key default gen_random_uuid(),
  material_order_id uuid not null references material_orders(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_path text not null,
  created_at timestamptz default now()
);

alter table order_pdfs enable row level security;

drop policy if exists "order_pdfs_select" on order_pdfs;
drop policy if exists "order_pdfs_insert" on order_pdfs;
drop policy if exists "order_pdfs_update" on order_pdfs;
drop policy if exists "order_pdfs_delete" on order_pdfs;

create policy "order_pdfs_select" on order_pdfs for select to authenticated using (true);
create policy "order_pdfs_insert" on order_pdfs for insert to authenticated with check (true);
create policy "order_pdfs_update" on order_pdfs for update to authenticated using (true);
create policy "order_pdfs_delete" on order_pdfs for delete to authenticated using (true);

insert into order_pdfs (material_order_id, file_name, file_url, file_path)
select
  id,
  supplier_order_pdf_name,
  supplier_order_pdf_url,
  supplier_order_pdf_path
from material_orders
where supplier_order_pdf_url is not null
  and supplier_order_pdf_path is not null
  and not exists (
    select 1
    from order_pdfs
    where order_pdfs.material_order_id = material_orders.id
      and order_pdfs.file_path = material_orders.supplier_order_pdf_path
  );
