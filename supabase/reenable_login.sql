do $$
declare
  table_name text;
  tables text[] := array[
    'customers',
    'suppliers',
    'materials',
    'cross_sections',
    'work_preparations',
    'profiles',
    'material_orders',
    'order_items',
    'goods_receipts',
    'scrap_items',
    'order_history'
  ];
begin
  foreach table_name in array tables loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists temp_login_disabled_anon_all on public.%I', table_name);
      execute format('revoke insert, update, delete on table public.%I from anon', table_name);
    end if;
  end loop;
end $$;
