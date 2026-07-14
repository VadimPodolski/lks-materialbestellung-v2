-- Ermittelt bei jeder 2D-Bestellung die kleinste freie TAFEL-Nummer.
begin;

create or replace function public.next_tafel_order_number()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'TAFEL-' || lpad(candidate.number::text, 5, '0')
  from generate_series(1, 99999) as candidate(number)
  where not exists (
    select 1
    from public.material_orders orders
    where orders.order_area = '2d-laser'
      and orders.order_number = 'TAFEL-' || lpad(candidate.number::text, 5, '0')
  )
  order by candidate.number
  limit 1;
$$;

revoke all on function public.next_tafel_order_number() from public;
grant execute on function public.next_tafel_order_number() to authenticated;

commit;
