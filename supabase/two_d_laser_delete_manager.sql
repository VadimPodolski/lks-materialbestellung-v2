-- Begrenzte Loeschberechtigung fuer den 2D-Laser-Verantwortlichen.
-- Gilt nur fuer 2D-Laser-Auftraege und ausschliesslich 2D-Laser-Stammdaten.

begin;

create or replace function public.is_two_d_laser_delete_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'y.ballach@lks-technik.de'
  or exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and lower(coalesce(profiles.email, '')) = 'y.ballach@lks-technik.de'
  );
$$;

grant execute on function public.is_two_d_laser_delete_manager() to authenticated;

drop policy if exists orders_delete on public.material_orders;
create policy orders_delete on public.material_orders
  for delete to authenticated
  using (
    public.is_admin_user()
    or public.can_delete_material_order(created_at)
    or (order_area = '2d-laser' and public.is_two_d_laser_delete_manager())
  );

drop policy if exists materials_delete on public.materials;
create policy materials_delete on public.materials
  for delete to authenticated
  using (
    public.is_admin_user()
    or (order_area = '2d-laser' and public.is_two_d_laser_delete_manager())
  );

drop policy if exists material_thicknesses_delete on public.material_thicknesses;
create policy material_thicknesses_delete on public.material_thicknesses
  for delete to authenticated
  using (
    public.is_admin_user()
    or (order_area = '2d-laser' and public.is_two_d_laser_delete_manager())
  );

drop policy if exists formats_delete on public.formats;
create policy formats_delete on public.formats
  for delete to authenticated
  using (public.is_admin_user() or public.is_two_d_laser_delete_manager());

create or replace function public.prevent_late_material_order_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_admin_user()
     and not (
       old.order_area = '2d-laser'
       and public.is_two_d_laser_delete_manager()
     )
     and not public.can_delete_material_order(old.created_at) then
    raise exception 'Bestellungen koennen nach zwei Werktagen nicht mehr geloescht werden.';
  end if;

  return old;
end;
$$;

commit;
