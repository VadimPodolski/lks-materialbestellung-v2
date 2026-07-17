-- Auftrags-PDFs in drei Dokumentarten gliedern.

begin;

alter table public.order_pdfs
  add column if not exists document_type text;

update public.order_pdfs pdf
set document_type = case
  when lower(pdf.file_name) ~ '(lieferschein|delivery[_ -]?note|(^|[^a-z])ls[_ -]?[0-9])'
    then 'supplier_delivery_note'
  when lower(pdf.file_name) = lower(mo.order_number || '.pdf')
    then 'lks_order'
  else 'supplier_confirmation'
end
from public.material_orders mo
where mo.id = pdf.material_order_id
  and pdf.document_type is null;

alter table public.order_pdfs
  alter column document_type set default 'supplier_confirmation',
  alter column document_type set not null;

alter table public.order_pdfs
  drop constraint if exists order_pdfs_document_type_check;

alter table public.order_pdfs
  add constraint order_pdfs_document_type_check
    check (document_type in ('lks_order', 'supplier_confirmation', 'supplier_quote', 'supplier_delivery_note'));

create index if not exists order_pdfs_material_order_document_type_idx
  on public.order_pdfs (material_order_id, document_type, created_at desc);

commit;
