-- AB-PDF vom Lieferanten am Auftrag speichern.
-- In Supabase SQL Editor ausführen.

alter table material_orders
  add column if not exists supplier_order_pdf_name text,
  add column if not exists supplier_order_pdf_url text,
  add column if not exists supplier_order_pdf_path text;

insert into storage.buckets (id, name, public)
values ('order-pdfs', 'order-pdfs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "order_pdfs_select" on storage.objects;
drop policy if exists "order_pdfs_insert" on storage.objects;
drop policy if exists "order_pdfs_update" on storage.objects;
drop policy if exists "order_pdfs_delete" on storage.objects;

create policy "order_pdfs_select" on storage.objects
for select to authenticated
using (bucket_id = 'order-pdfs');

create policy "order_pdfs_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'order-pdfs');

create policy "order_pdfs_update" on storage.objects
for update to authenticated
using (bucket_id = 'order-pdfs');

create policy "order_pdfs_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'order-pdfs');
