-- Automatische Preisübernahme aus Lieferanten-Auftragsbestätigungen nachverfolgen.

begin;

alter table public.order_pdfs
  add column if not exists price_import_status text,
  add column if not exists price_import_message text,
  add column if not exists prices_imported_at timestamptz;

alter table public.order_pdfs
  drop constraint if exists order_pdfs_price_import_status_check;

alter table public.order_pdfs
  add constraint order_pdfs_price_import_status_check
    check (
      price_import_status is null
      or price_import_status in ('pending', 'processing', 'imported', 'failed')
    );

update public.order_pdfs
set price_import_status = 'pending',
    price_import_message = null
where document_type = 'supplier_confirmation'
  and coalesce(price_import_status, '') <> 'imported';

update public.order_pdfs
set price_import_status = null,
    price_import_message = null,
    prices_imported_at = null
where document_type <> 'supplier_confirmation';

commit;
