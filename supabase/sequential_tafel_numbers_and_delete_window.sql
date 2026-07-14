-- TAFEL-Nummern bleiben auch nach Loeschungen verbraucht.
-- Bestellungen koennen nur bis zwei Werktage nach ihrer Erstellung geloescht werden.
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

create or replace function public.can_delete_material_order(created_at_value timestamptz)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  local_deadline timestamp := created_at_value at time zone 'Europe/Berlin';
  business_days integer := 0;
begin
  if created_at_value is null then
    return false;
  end if;

  while business_days < 2 loop
    local_deadline := local_deadline + interval '1 day';

    if extract(isodow from local_deadline) between 1 and 5 then
      business_days := business_days + 1;
    end if;
  end loop;

  return now() < (local_deadline at time zone 'Europe/Berlin');
end;
$$;

create or replace function public.prevent_late_material_order_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.can_delete_material_order(old.created_at) then
    raise exception 'Bestellungen koennen nach zwei Werktagen nicht mehr geloescht werden.';
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_late_material_order_delete on public.material_orders;
create trigger prevent_late_material_order_delete
  before delete on public.material_orders
  for each row execute function public.prevent_late_material_order_delete();

commit;
