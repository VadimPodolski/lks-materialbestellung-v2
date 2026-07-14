-- Administratoren duerfen Auftraege unabhaengig von der Zwei-Werktage-Frist loeschen.
-- Fuer alle anderen Benutzer bleibt die bestehende Frist unveraendert.

begin;

create or replace function public.prevent_late_material_order_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_admin_user()
     and not public.can_delete_material_order(old.created_at) then
    raise exception 'Bestellungen koennen nach zwei Werktagen nicht mehr geloescht werden.';
  end if;

  return old;
end;
$$;

commit;
