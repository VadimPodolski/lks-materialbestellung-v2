-- Kunden-Liefertermin am Auftrag speichern.
-- In Supabase SQL Editor ausfuehren.

alter table material_orders
  add column if not exists customer_delivery_date date;
