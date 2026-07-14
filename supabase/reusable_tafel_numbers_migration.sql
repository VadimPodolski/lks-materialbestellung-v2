-- Vergibt dauerhaft fortlaufende TAFEL-Nummern. Geloeschte Nummern bleiben verbraucht.
begin;

create sequence if not exists public.tafel_order_number_seq;

do $$
declare
  max_number bigint;
  sequence_number bigint;
  sequence_called boolean;
begin
  select max(substring(order_number from '^TAFEL-([0-9]+)$')::bigint)
    into max_number
  from public.material_orders
  where order_area = '2d-laser'
    and order_number ~ '^TAFEL-[0-9]+$';

  select last_value, is_called
    into sequence_number, sequence_called
  from public.tafel_order_number_seq;

  if max_number is null and not sequence_called then
    perform setval('public.tafel_order_number_seq', 1, false);
  else
    perform setval(
      'public.tafel_order_number_seq',
      greatest(coalesce(max_number, 0), case when sequence_called then sequence_number else 0 end),
      true
    );
  end if;
end $$;

create or replace function public.next_tafel_order_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'TAFEL-' || lpad(nextval('public.tafel_order_number_seq')::text, 5, '0');
$$;

revoke all on function public.next_tafel_order_number() from public;
grant execute on function public.next_tafel_order_number() to authenticated;

commit;
