-- Rekonstruiert einmalig Erstellvorgänge aus allen noch vorhandenen Bestandsdaten.
-- Frühere Zwischenänderungen und bereits gelöschte Datensätze sind nicht rekonstruierbar.

alter table public.audit_log
  add column if not exists is_reconstructed boolean not null default false;

do $$
declare
  audited_table text;
  source_row record;
  row_data jsonb;
  historical_time timestamptz;
  historical_actor_id uuid;
  historical_actor_name text;
  historical_actor_email text;
  historical_order_id uuid;
  historical_order_number text;
  historical_area text;
  historical_record_id text;
  actor_text text;
begin
  foreach audited_table in array array[
    'material_orders',
    'order_items',
    'goods_receipts',
    'scrap_items',
    'order_pdfs',
    'customers',
    'suppliers',
    'materials',
    'material_thicknesses',
    'cross_sections',
    'work_preparations',
    'formats',
    'packaging_defaults',
    'profiles',
    'inbound_email_attachments'
  ] loop
    if to_regclass('public.' || audited_table) is null then
      continue;
    end if;

    for source_row in execute format('select to_jsonb(source) as data from public.%I source', audited_table)
    loop
      row_data := source_row.data;
      historical_record_id := coalesce(row_data ->> 'id', row_data ->> 'name', row_data ->> 'material_order_id');

      if historical_record_id is null or exists (
        select 1
        from public.audit_log existing
        where existing.table_name = audited_table
          and existing.record_id = historical_record_id
          and existing.action = 'INSERT'
      ) then
        continue;
      end if;

      historical_time := coalesce(
        nullif(row_data ->> 'created_at', '')::timestamptz,
        nullif(row_data ->> 'received_at', '')::timestamptz,
        nullif(row_data ->> 'uploaded_at', '')::timestamptz,
        nullif(row_data ->> 'updated_at', '')::timestamptz,
        now()
      );

      actor_text := coalesce(
        row_data ->> 'created_by',
        row_data ->> 'received_by',
        row_data ->> 'uploaded_by'
      );
      historical_actor_id := case
        when actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then actor_text::uuid
        else null
      end;

      historical_actor_name := null;
      historical_actor_email := null;
      if historical_actor_id is not null then
        select profiles.full_name, profiles.email
          into historical_actor_name, historical_actor_email
        from public.profiles
        where profiles.id = historical_actor_id;
      end if;

      historical_order_id := null;
      historical_order_number := null;
      historical_area := row_data ->> 'order_area';

      if audited_table = 'material_orders' then
        historical_order_id := nullif(row_data ->> 'id', '')::uuid;
        historical_order_number := row_data ->> 'order_number';
      elsif audited_table in ('order_items', 'goods_receipts', 'scrap_items', 'order_pdfs') then
        historical_order_id := nullif(row_data ->> 'material_order_id', '')::uuid;
        select orders.order_number, orders.order_area
          into historical_order_number, historical_area
        from public.material_orders orders
        where orders.id = historical_order_id;
      end if;

      if audited_table = 'profiles' then
        historical_area := 'administration';
      elsif historical_area is null and audited_table in (
        'customers', 'suppliers', 'materials', 'material_thicknesses',
        'cross_sections', 'work_preparations', 'formats', 'packaging_defaults'
      ) then
        historical_area := 'stammdaten';
      elsif historical_area is null and audited_table = 'inbound_email_attachments' then
        historical_area := 'email-import';
      end if;

      insert into public.audit_log (
        occurred_at,
        actor_id,
        actor_name,
        actor_email,
        action,
        table_name,
        record_id,
        order_id,
        order_number,
        area,
        changed_fields,
        old_data,
        new_data,
        is_reconstructed
      ) values (
        historical_time,
        historical_actor_id,
        historical_actor_name,
        historical_actor_email,
        'INSERT',
        audited_table,
        historical_record_id,
        historical_order_id,
        historical_order_number,
        historical_area,
        null,
        null,
        row_data,
        true
      );
    end loop;
  end loop;
end;
$$;
