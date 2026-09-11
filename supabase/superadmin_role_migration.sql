begin;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin', 'superadmin'));

update public.profiles
set role = 'superadmin',
    approved = true
where lower(email) = 'vadim.podolski@online.de';

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'superadmin')
  )
  or exists (
    select 1
    from public.profiles
    where lower(email) = lower(auth.jwt() ->> 'email')
      and role in ('admin', 'superadmin')
  );
$$;

create or replace function public.is_superadmin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'superadmin'
  )
  or exists (
    select 1
    from public.profiles
    where lower(email) = lower(auth.jwt() ->> 'email')
      and role = 'superadmin'
  );
$$;

create or replace function public.protect_elevated_profile_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.role <> 'user' and not public.is_superadmin_user() then
      raise exception 'Nur der Superadmin darf Administratoren anlegen.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if lower(old.email) = 'vadim.podolski@online.de' then
      raise exception 'Das Superadmin-Konto ist geschützt.';
    end if;
    if auth.uid() is not null
       and old.role in ('admin', 'superadmin')
       and not public.is_superadmin_user() then
      raise exception 'Nur der Superadmin darf Administratoren löschen.';
    end if;
    return old;
  end if;

  if lower(old.email) = 'vadim.podolski@online.de'
     and (new.role <> 'superadmin' or lower(new.email) <> 'vadim.podolski@online.de') then
    raise exception 'Das Superadmin-Konto ist geschützt.';
  end if;

  if auth.uid() is not null
     and new.role is distinct from old.role
     and not public.is_superadmin_user() then
    raise exception 'Nur der Superadmin darf Rollen ändern.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_elevated_profile_roles_trigger on public.profiles;
create trigger protect_elevated_profile_roles_trigger
before insert or update or delete on public.profiles
for each row execute function public.protect_elevated_profile_roles();

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
    and role = 'user';
end;
$$;

revoke all on function public.is_superadmin_user() from public;
grant execute on function public.is_superadmin_user() to authenticated;
revoke all on function public.set_user_approval(uuid, boolean) from public;
grant execute on function public.set_user_approval(uuid, boolean) to authenticated;

commit;
