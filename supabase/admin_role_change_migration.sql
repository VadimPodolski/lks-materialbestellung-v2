-- Administratorwechsel: Berechtigungen werden ausschließlich über profiles.role ermittelt.

update public.profiles
set role = 'admin', approved = true
where lower(email) = 'vadim.podolski@online.de';

update public.profiles
set role = 'user'
where lower(email) = 'v.podolski@lks-technik.de';

create or replace function public.set_user_approval(target_user_id uuid, should_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user() then
    raise exception 'Keine Administratorberechtigung.';
  end if;

  update public.profiles
  set approved = should_approve
  where id = target_user_id
    and role <> 'admin';
end;
$$;

revoke all on function public.set_user_approval(uuid, boolean) from public;
grant execute on function public.set_user_approval(uuid, boolean) to authenticated;
