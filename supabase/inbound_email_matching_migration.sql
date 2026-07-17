-- Eingehende Auftragsbestätigungen aus dem Einkaufspostfach.
-- Die eigentliche E-Mail bleibt bei IONOS; gespeichert werden nur PDF-Anhang und Zuordnungsdaten.

create table if not exists public.inbound_email_attachments (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  mailbox text not null default 'INBOX',
  message_uid bigint,
  message_id text,
  sender_email text,
  sender_name text,
  subject text,
  received_at timestamptz,
  file_name text not null,
  file_path text not null,
  file_url text not null,
  status text not null default 'review'
    check (status in ('review', 'assigned', 'ignored', 'failed')),
  matched_order_id uuid references public.material_orders(id) on delete set null,
  confidence integer not null default 0 check (confidence between 0 and 100),
  match_details jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inbound_email_attachments_status_created_idx
  on public.inbound_email_attachments (status, created_at desc);

create index if not exists inbound_email_attachments_order_idx
  on public.inbound_email_attachments (matched_order_id);

alter table public.inbound_email_attachments enable row level security;

drop policy if exists inbound_email_attachments_select on public.inbound_email_attachments;
drop policy if exists inbound_email_attachments_update on public.inbound_email_attachments;

create policy inbound_email_attachments_select
  on public.inbound_email_attachments
  for select to authenticated
  using (true);

create policy inbound_email_attachments_update
  on public.inbound_email_attachments
  for update to authenticated
  using (true)
  with check (true);

insert into storage.buckets (id, name, public)
values ('inbound-email-pdfs', 'inbound-email-pdfs', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists inbound_email_pdfs_select on storage.objects;

create policy inbound_email_pdfs_select
  on storage.objects
  for select to authenticated
  using (bucket_id = 'inbound-email-pdfs');
