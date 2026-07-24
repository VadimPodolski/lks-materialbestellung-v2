begin;

alter table public.order_pdfs
  add column if not exists price_import_data jsonb not null default '[]'::jsonb;

update public.order_pdfs
set price_import_data = '[]'::jsonb
where price_import_data is null;

commit;
