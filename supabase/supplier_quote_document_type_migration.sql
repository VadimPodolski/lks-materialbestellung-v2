-- Lieferanten-Angebote als eigene PDF-Dokumentart speichern.

begin;

alter table public.order_pdfs
  drop constraint if exists order_pdfs_document_type_check;

alter table public.order_pdfs
  add constraint order_pdfs_document_type_check
    check (document_type in (
      'lks_order',
      'supplier_confirmation',
      'supplier_quote',
      'supplier_delivery_note'
    ));

update public.order_pdfs
set document_type = 'supplier_quote',
    price_import_status = 'pending',
    price_import_message = null,
    prices_imported_at = null
where document_type = 'supplier_confirmation'
  and upper(file_name) ~ '(^|[^A-Z])KAN[[:space:]_-]*[0-9]';

commit;
