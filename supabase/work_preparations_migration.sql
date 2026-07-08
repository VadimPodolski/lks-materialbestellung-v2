create table if not exists work_preparations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

alter table work_preparations enable row level security;

do $$
begin
  create policy "work_preparations_select" on work_preparations for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "work_preparations_insert" on work_preparations for insert to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "work_preparations_update" on work_preparations for update to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "work_preparations_delete" on work_preparations for delete to authenticated using (true);
exception when duplicate_object then null;
end $$;

alter table order_items
  add column if not exists av_1 text,
  add column if not exists av_2 text,
  add column if not exists av_3 text,
  add column if not exists av_4 text;

insert into work_preparations (name)
values
  ('Sortieren'),
  ('Kanten'),
  ('Schweißen'),
  ('Pulverbeschichtung')
on conflict (name) do nothing;
