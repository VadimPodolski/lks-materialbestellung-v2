-- PDF-Loeschungen folgen der Zwei-Werktage-Frist des zugehoerigen Auftrags.
-- Nach Ablauf der Frist duerfen nur Administratoren PDF-Dateien loeschen.

begin;

drop policy if exists order_pdfs_delete on public.order_pdfs;
drop policy if exists "order_pdfs_delete" on public.order_pdfs;

create policy order_pdfs_delete on public.order_pdfs
  for delete to authenticated
  using (
    public.is_admin_user()
    or exists (
      select 1
      from public.material_orders
      where material_orders.id = order_pdfs.material_order_id
        and public.can_delete_material_order(material_orders.created_at)
    )
  );

drop policy if exists order_pdfs_delete on storage.objects;
drop policy if exists "order_pdfs_delete" on storage.objects;

create policy order_pdfs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'order-pdfs'
    and (
      public.is_admin_user()
      or exists (
        select 1
        from public.material_orders
        where material_orders.id::text = (storage.foldername(name))[1]
          and public.can_delete_material_order(material_orders.created_at)
      )
    )
  );

commit;
