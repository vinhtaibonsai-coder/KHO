-- Chạy thủ công một lần trong Supabase SQL Editor. Bảng snapshot kho theo ngày.
create table if not exists public.warehouse_backups (
  id text primary key,
  snapshot_date date not null,
  items jsonb not null,
  total_warehouses integer not null,
  map_layout jsonb,
  created_at timestamptz not null default now()
);
alter table public.warehouse_backups enable row level security;

drop policy if exists "public read warehouse_backups" on public.warehouse_backups;
drop policy if exists "public write warehouse_backups" on public.warehouse_backups;
create policy "public read warehouse_backups" on public.warehouse_backups for select using (true);
create policy "public write warehouse_backups" on public.warehouse_backups for all using (true) with check (true);
