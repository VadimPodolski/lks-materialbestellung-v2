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
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
  or exists (
    select 1
    from public.profiles
    where lower(profiles.email) = lower(auth.jwt() ->> 'email')
      and profiles.role = 'admin'
  );
$$;

grant execute on function public.is_admin_user() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['customers', 'suppliers', 'materials', 'cross_sections']
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);

      execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_delete', table_name);

      execute format('create policy %I on public.%I for select to authenticated using (true)', table_name || '_select', table_name);
      execute format('create policy %I on public.%I for insert to authenticated with check (true)', table_name || '_insert', table_name);
      execute format('create policy %I on public.%I for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user())', table_name || '_update', table_name);
      execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin_user())', table_name || '_delete', table_name);
    end if;
  end loop;
end $$;
