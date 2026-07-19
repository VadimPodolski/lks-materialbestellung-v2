-- Neue Registrierungen müssen vor dem Portalzugriff von einem Administrator freigegeben werden.

alter table public.profiles add column if not exists approved boolean;

-- Alle Benutzer, die vor Einführung des Freigabeprozesses existierten, bleiben freigeschaltet.
update public.profiles set approved = true where approved is null;

alter table public.profiles alter column approved set default false;
alter table public.profiles alter column approved set not null;

-- Wiederholt registrierte E-Mail-Adressen mit der aktuellen Auth-Benutzer-ID verbinden.
update public.profiles as profile
set id = auth_user.id,
    full_name = coalesce(
      profile.full_name,
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'name'), '')
    ),
    approved = true
from auth.users as auth_user
where lower(profile.email) = lower(auth_user.email)
  and profile.id <> auth_user.id;

-- Fehlende Profile für alle bereits vorhandenen Auth-Benutzer nachtragen.
insert into public.profiles (id, email, full_name, role, approved)
select
  auth_user.id,
  lower(auth_user.email),
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
    initcap(replace(split_part(coalesce(auth_user.email, ''), '@', 1), '.', ' '))
  ),
  'user',
  true
from auth.users as auth_user
where not exists (
  select 1 from public.profiles as profile where profile.id = auth_user.id
);

create or replace function public.handle_new_lks_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_name text;
begin
  profile_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    initcap(replace(split_part(coalesce(new.email, ''), '@', 1), '.', ' '))
  );

  update public.profiles
  set id = new.id,
      email = lower(new.email),
      full_name = coalesce(public.profiles.full_name, profile_name),
      role = 'user',
      approved = false
  where lower(public.profiles.email) = lower(new.email)
    and public.profiles.id <> new.id;

  insert into public.profiles (id, email, full_name, role, approved)
  values (new.id, lower(new.email), profile_name, 'user', false)
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);

  return new;
end;
$$;

drop trigger if exists lks_create_profile_after_signup on auth.users;
create trigger lks_create_profile_after_signup
after insert on auth.users
for each row execute function public.handle_new_lks_user();

create or replace function public.protect_profile_access_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_admin_user()
     and (new.role is distinct from old.role or new.approved is distinct from old.approved) then
    raise exception 'Nur Administratoren dürfen Rolle oder Freigabe ändern.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_access_fields on public.profiles;
create trigger protect_profile_access_fields
before update on public.profiles
for each row execute function public.protect_profile_access_fields();

create or replace function public.set_user_approval(target_user_id uuid, should_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user()
     and lower(coalesce(auth.jwt() ->> 'email', '')) <> 'v.podolski@lks-technik.de' then
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
