-- Zeigt die naechste TAFEL-Nummer an, ohne sie bereits zu verbrauchen.
begin;

create or replace function public.peek_next_tafel_order_number()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'TAFEL-' || lpad(
    (case when is_called then last_value + 1 else last_value end)::text,
    5,
    '0'
  )
  from public.tafel_order_number_seq;
$$;

revoke all on function public.peek_next_tafel_order_number() from public;
grant execute on function public.peek_next_tafel_order_number() to authenticated;

commit;
