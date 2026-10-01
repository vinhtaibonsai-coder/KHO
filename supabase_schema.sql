-- ============================================================
-- SUPABASE SCHEMA: Hệ thống định vị 30 ô kho
-- Chạy toàn bộ file này trong Supabase SQL Editor (Dashboard)
-- ============================================================

create table if not exists public.warehouse_items (
  sku         text primary key,
  name        text not null default 'Hàng độc bản',
  warehouse   integer not null check (warehouse between 1 and 30),
  qty         integer not null default 1,
  updated_at  timestamptz not null default now()
);

create table if not exists public.zalo_messages (
  id          text primary key,
  group_id    text not null,
  warehouse   integer check (warehouse between 1 and 30),
  message     text not null,
  status      text not null default 'ok' check (status in ('ok', 'error')),
  detail      text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.warehouse_history (
  id              text primary key,
  sku             text not null,
  action          text not null check (action in ('in', 'out', 'transfer')),
  from_warehouse  integer check (from_warehouse between 1 and 30),
  to_warehouse    integer check (to_warehouse between 1 and 30),
  note            text not null default '',
  created_at      timestamptz not null default now()
);

create index if not exists warehouse_items_warehouse_idx on public.warehouse_items (warehouse);
create index if not exists zalo_messages_created_at_idx on public.zalo_messages (created_at desc);
create index if not exists warehouse_history_created_at_idx on public.warehouse_history (created_at desc);
create index if not exists warehouse_history_sku_idx on public.warehouse_history (sku);

-- Giữ tối đa 200 nhật ký tin nhắn gần nhất
create or replace function public.trim_zalo_messages() returns trigger
language plpgsql as $$
begin
  delete from public.zalo_messages
  where id not in (
    select id from public.zalo_messages
    order by created_at desc
    limit 200
  );
  return new;
end;
$$;

drop trigger if exists trim_zalo_messages_trg on public.zalo_messages;
create trigger trim_zalo_messages_trg
after insert on public.zalo_messages
for each row execute function public.trim_zalo_messages();

-- ============================================================
-- BẬT REALTIME (Websocket) cho cả 3 bảng
-- ============================================================
alter publication supabase_realtime add table public.warehouse_items;
alter publication supabase_realtime add table public.zalo_messages;
alter publication supabase_realtime add table public.warehouse_history;

-- Gửi cả dữ liệu cũ (UPDATE/DELETE) để client cập nhật chính xác
alter table public.warehouse_items replica identity full;
alter table public.zalo_messages replica identity full;
alter table public.warehouse_history replica identity full;

-- ============================================================
-- (TUỲ CHỌN) Row Level Security: cho phép đọc/ghi ẩn danh
-- Bỏ các block này nếu bạn chỉ dùng Service Role Key phía server.
-- ============================================================
alter table public.warehouse_items enable row level security;
alter table public.zalo_messages enable row level security;
alter table public.warehouse_history enable row level security;

drop policy if exists "public read warehouse_items" on public.warehouse_items;
create policy "public read warehouse_items"
  on public.warehouse_items for select using (true);

drop policy if exists "public write warehouse_items" on public.warehouse_items;
create policy "public write warehouse_items"
  on public.warehouse_items for all using (true) with check (true);

drop policy if exists "public read zalo_messages" on public.zalo_messages;
create policy "public read zalo_messages"
  on public.zalo_messages for select using (true);

drop policy if exists "public write zalo_messages" on public.zalo_messages;
create policy "public write zalo_messages"
  on public.zalo_messages for all using (true) with check (true);

drop policy if exists "public read warehouse_history" on public.warehouse_history;
create policy "public read warehouse_history"
  on public.warehouse_history for select using (true);

drop policy if exists "public write warehouse_history" on public.warehouse_history;
create policy "public write warehouse_history"
  on public.warehouse_history for all using (true) with check (true);

-- ============================================================
-- SEED (tuỳ chọn): một vài mã mẫu để kiểm tra giao diện
-- ============================================================
insert into public.warehouse_items (sku, name, warehouse, qty, updated_at) values
  ('E120.124', 'Hàng độc bản', 3,  1, now() - interval '15 minutes'),
  ('E80.345',  'Hàng độc bản', 7,  1, now() - interval '45 minutes'),
  ('E120.485', 'Hàng độc bản', 12, 1, now() - interval '2 hours'),
  ('P120.50',  'Hàng độc bản', 18, 1, now() - interval '5 hours'),
  ('E60.110',  'Hàng độc bản', 1,  1, now() - interval '30 minutes'),
  ('P80.25',   'Hàng độc bản', 25, 1, now() - interval '1 hour'),
  ('E100.99',  'Hàng độc bản', 30, 1, now() - interval '10 minutes')
on conflict (sku) do nothing;
